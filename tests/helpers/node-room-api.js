// Execute the real Node handler without opening a socket or touching user rooms.
const {Readable}=require('node:stream');
const {createRoomService}=require('../../server');
module.exports=function(){
  const api=createRoomService();
  const env={DB:{rooms:{get(id){return {get data(){return JSON.stringify(api.rooms.get(id));},set data(value){api.rooms.set(id,JSON.parse(value));}};}}}};
  const request=(_,url,body=null,headers={})=>new Promise((resolve,reject)=>{
    const req=Readable.from(body===null?[]:[JSON.stringify(body)]);req.method=body===null?'GET':'POST';
    req.headers=Object.fromEntries(Object.entries(headers).map(([name,value])=>[name.toLowerCase(),value]));
    let status;const res={writeHead(s){status=s;},end(data){try{resolve({status,body:JSON.parse(data)})}catch(e){reject(e)}}};
    api.handleApi(req,res,new URL('http://unit.test'+url)).catch(reject);
  });
  return {env,request,serveStatic:(response,url)=>api.serveStatic({},response,url)};
};
