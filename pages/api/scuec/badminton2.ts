// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import type { ResponseType } from '../_type'
import { encryptPassword } from './_utils'
import { getTime, getRelativeDate, delay } from '../_utils'

import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  AxiosInstance,
  AxiosAdapter,
  Cancel,
  CancelToken,
  CancelTokenSource,
  Canceler
} from 'axios';

axios.defaults.withCredentials = true;

export default async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseType>
) => {
  let {
    username, // 用户名
    password, // 密码

    txrsfrzh, // 同行人学号
    yysjd1, // 预约时间点1，例 19:00-20:00
    yysjd2, // 预约时间点2，例 20:00-21:00
    yycdbh, // 预约场地编号
    yyxdrq, // 预约相对日期，例如 '+1'，表示明天
  } = req.body;

  let sporter = new Sporter(username, password);

  /* 登陆 */
  if (!await sporter.login()) {
    return res.status(200).json({
      success: false,
      data: '登陆失败',
    })
  }

  /* 提交 */
  let result = await sporter.submit(txrsfrzh, yysjd1, yysjd2, yycdbh, getRelativeDate(yyxdrq));

  return res.status(200).json(result);
}

/*  */
function stringify(obj: any) {
  const params = new URLSearchParams();
  Object.keys(obj).map(key => {
    params.append(key, obj[key]);
  })
  return params;
}

/*  */
function getCookie(setCookies: string[], cookieKey: string) {
  let cookie = '';

  setCookies.forEach(item => {
    // if (item.includes(cookieKey)) {
    //   cookie = item;
    // }
    let result = new RegExp(`${cookieKey}\\S+;`).exec(item);
    result && (cookie = result[0]);
  })
  return cookie;
}

/*  */
function stringifyCookies(Cookies: any) {
  let cookieValue = '';
  Object.keys(Cookies).map(key => {
    cookieValue += Cookies[key];
  })
  return cookieValue;
}

class Sporter {
  username: string;
  password: string;
  session: string;
  axios: AxiosInstance;

  /* 构造函数 */
  constructor(username: string, password: string) {
    this.username = username; //账号
    this.password = password; //密码
    this.session = ''; //session
    this.axios = axios.create({
      // maxRedirects: 0,
      withCredentials: true,
    });

  }

  async login(): Promise<boolean> {
    let next_url = '';
    let cookies: any = {};

    let pwdEncryptSalt: RegExpExecArray | null = null;
    let execution: RegExpExecArray | null = null;

    const config = {
      // proxy: { host: '127.0.0.1', port: 8560 }
    }

    await this.axios
      .get('http://id.scuec.edu.cn/authserver/login?service=http%3A%2F%2Fwfw.scuec.edu.cn%2F2021%2F08%2F29%2Fbook', config)
      .then((response: AxiosResponse) => {

        /* 从网页中获取 pwdEncryptSalt 和 execution */
        pwdEncryptSalt = /(?<=id="pwdEncryptSalt" value=")\w+(?=" )/.exec(response.data);
        execution = /(?<=name="execution" value=").+(?=" )/.exec(response.data);

        const setCookies = response.headers['set-cookie'];
        if (setCookies) {
          cookies['route'] = getCookie(setCookies, 'route');
          cookies['JSESSIONID'] = getCookie(setCookies, 'JSESSIONID');
          cookies['i18'] = 'org.springframework.web.servlet.i18n.CookieLocaleResolver.LOCALE=en;';
        }
      });

    /* 未能获取到 pwdEncryptSalt 和 execution */
    if (!(pwdEncryptSalt && execution)) return false;

    return await this.axios
      .post("http://id.scuec.edu.cn/authserver/login?service=http%3A%2F%2Fwfw.scuec.edu.cn%2F2021%2F08%2F29%2Fbook", stringify({
        username: this.username,
        password: encryptPassword(this.password, pwdEncryptSalt[0]),
        captcha: "", //验证码
        _eventId: "submit",
        cllt: "userNameLogin",
        dllt: "generalLogin",
        lt: "",
        execution: execution[0],
      }), {
        ...config,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': stringifyCookies(cookies),
        },
        beforeRedirect: (options: AxiosRequestConfig) => {
          // console.log("beforeRedirect", "302");
        }
      })
      .then((response: AxiosResponse) => {
        const setCookies = response.headers['set-cookie'];
        if (setCookies) this.session = getCookie(setCookies, 'scuec_session');
        console.log(this.session);
        return true;
      })
      .catch((error: AxiosError) => {
        console.log("Login error");
        return false;
      })
  }

  /* 提交 */
  async submit(txrsfrzh: string, yysjd1: string, yysjd2: string, yycdbh: string, yyrq: string): Promise<ResponseType> {
    type TaskParam = {
      type: "lock" | "submit",
      yysjd: string,
    }

    type TaskResponse = {
      name: string;
      data: any,
    }

    const config = {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.session,
      },
      // proxy: { host: '127.0.0.1', port: 8560 }
    }

    const tasksParams: TaskParam[] = [
      { type: "lock", yysjd: yysjd1 },
      { type: "lock", yysjd: yysjd2 },
      { type: "submit", yysjd: yysjd1 },
      { type: "submit", yysjd: yysjd2 }
    ]

    let intervalTasks_timer_init = () => {
      return setInterval(() => {
        tasksParams
          .map((param: TaskParam, index: number) => {
            setTimeout(() => {
              const { type, yysjd } = param;
              const url = type == "lock" ?
                "https://wfw.scuec.edu.cn/2021/08/29/book/check_playground_status" :
                "https://wfw.scuec.edu.cn/2021/08/29/book/book"
              const data = type == "lock" ?
                { yysjd, yycdbh, yyrq } :
                { yysj: yysjd, yycdbh, yyrq, txrsfrzh }

              this.axios
                .post(url, stringify(data), config)
                .then((response: AxiosResponse): TaskResponse => {
                  const { data } = response
                  return { data, name: `${this.username}|${type}|${yysjd}` }
                })
                .catch((error: AxiosError): TaskResponse => {
                  console.log(getTime(), error.code);

                  console.log(getTime(), error.code == "400" ? error.status : error.message);
                  if (error.status == "400") {
                    return { data: error.status, name: `${this.username}|${type}|${yysjd}` }
                  }
                  return { data: error.message, name: `${this.username}|${type}|${yysjd}` }
                })
                .then((response: TaskResponse) => {
                  console.log(getTime(), response.name);
                  console.log(getTime(), response.data);
                })
            }, 10 * index)
          })
      }, 333)
    }

    let intervalTasks_timer: NodeJS.Timer;

    setTimeout(() => { intervalTasks_timer = intervalTasks_timer_init() }, 0);
    setTimeout(() => { clearInterval(intervalTasks_timer) }, 30000);

    return { success: true, data: "任务已创建" };
  }
}