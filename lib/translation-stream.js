// Return the decoded prefix of a streamed JSON translation string. Incomplete
// escape sequences are withheld until complete, so users never see raw JSON.
export function translationPrefix(json) {
  const match=/"translation"\s*:\s*"/.exec(json);
  if(!match)return '';
  let output='';
  for(let i=match.index+match[0].length;i<json.length;i++){
    const c=json[i];if(c==='"')break;
    if(c!=='\\'){output+=c;continue}
    const escape=json[++i];if(!escape)break;
    if(escape==='u'){
      const hex=json.slice(i+1,i+5);if(!/^[\da-f]{4}$/i.test(hex))break;
      output+=String.fromCharCode(parseInt(hex,16));i+=4;
    }else{
      const map={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
      if(!(escape in map))break;output+=map[escape];
    }
  }
  return output.replace(/[\uD800-\uDBFF]$/,'');
}

export async function readCompletionStream(body,onText) {
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='',text='',completed=false;
  const accept=line=>{
    if(!line.startsWith('data:'))return;
    const data=line.slice(5).trim();if(!data)return;
    if(data==='[DONE]'){completed=true;return}
    const event=JSON.parse(data);
    if(event.error)throw new Error('Translation provider stream failed');
    if(event.choices?.[0]?.finish_reason==='length')throw new Error('Translation exceeded output limit');
    const delta=event.choices?.[0]?.delta?.content;
    if(typeof delta==='string'){text+=delta;onText(text)}
  };
  try{
    while(true){
      const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      let newline;while((newline=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,newline).replace(/\r$/,''));buffer=buffer.slice(newline+1)}
      if(done)break;
    }
    accept(buffer);
    if(!completed)throw new Error('Translation provider stream ended early');
    return text;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
