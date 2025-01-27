import * as superagent from "superagent";
import { DES, enc, mode, pad } from 'crypto-js';
import type { ResponseType } from '../_type';
import { getRelativeDate } from "../_utils";


/* 返回加密后的密码 */
function encryptPassword(password: string, key: string) {
  let keyHex = enc.Utf8.parse(key);
  let config = {
    mode: mode.ECB,
    padding: pad.Pkcs7
  }
  let result = DES.encrypt(password, keyHex, config).ciphertext.toString();
  return result;
}


export class ChaoXing {
  username: string;
  password: string;
  agent: superagent.SuperAgentStatic;

  /* 构造函数 */
  constructor(username: string, password: string) {
    this.username = username; //账号
    this.password = password; //密码
    this.agent = superagent.agent(); //agent
  }

  /* 登陆 */
  async login(): Promise<Boolean> {
    return await this.agent
      .post('https://passport2.chaoxing.com/fanyalogin') //登陆接口
      .type('form') //发送数据格式 Form
      .send({ //发送数据
        uname: this.username,
        password: encryptPassword(this.password, 'u2oh6Vu^HWe40fj'),
        t: 'true',
        fid: '-1',
        forbidotherlogin: '0',
        refer: 'http%3A%2F%2Fi.chaoxing.com'
      })
      .then(async res => {
        let result = JSON.parse(res.text).status;

        /* 登陆到 office.chaoxing.com */
        await this.agent.get('https://office.chaoxing.com/front/third/apps/seat/index');
        return result;
      })
      .catch(e => {
        return false;
      })
  }

  /* 签到 */
  async sign(): Promise<ResponseType> {
    /* 获取最近的预约信息 */
    let reserveInfo = await this.agent
    .get('https://office.chaoxing.com/data/apps/seatengine/reservelist')
    .query({
      pageSize: '1',
      seatId: '1234'
    })
    .then(res => {
      try {
        return res.body.data.reserveList[0];
      } catch (e) {
        return null;
      }
    })

    /* 签到 */
    return await this.agent
      .get('https://office.chaoxing.com/data/apps/seatengine/sign')
      .query(reserveInfo)
      .then(res => {
        return {
          success: res.body.success,
          data: res.body.msg
        }
      })
  }

  /* 获取 Token */
  async getToken(roomId: String): Promise<String> {
    return await this.agent
      .get("https://office.chaoxing.com/front/apps/seatengine/select")
      .query({
        id: roomId,
        day: getRelativeDate("1"),
        backLevel: "2",
        seatId: "602"
      })
      .then(res => {
        let index = res.text.indexOf("token: '") + 8;
        return res.text.slice(index, index + 32); //获取token
      })
  }

  /* 预约 */
  async sbumit(roomId: String, seatNum: String, startTime: String, endTime: String, token: String): Promise<ResponseType> {
    /* 获取图形验证信息 */
    let captcha = await this.agent.get("http://chaoxing_slidecaptcha_verify:8888/validate/pop")
      .then(async res => {
        if(res.body.success) {
          return res.body.validate
        }
        else {
          return "validate_null"
        }
      })
      .catch(e => {
        return "validate_error"
      })
    
    console.log(captcha)

    return await this.agent
      .post('https://office.chaoxing.com/data/apps/seatengine/submit')
      .type('form') //发送数据格式 Form
      .send({ //发送数据
        roomId: roomId,
        startTime: startTime,
        endTime: endTime,
        day: getRelativeDate("1"),
        seatNum: seatNum,
        token: token,
        captcha: captcha
      })
      .then(res => {
        return {
          success: res.body.success,
          data: res.body.msg
        }
      })
  }
}