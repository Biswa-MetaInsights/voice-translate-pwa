// Small DOM fixture with persistent text nodes for the frontend VM tests.
export function createDocument(){
  const elements=new Map();
  const document={querySelectorAll:()=>[],documentElement:{dataset:{}},addEventListener(){}};
  document.createTextNode=data=>({data,get textContent(){return this.data}});
  document.createElement=()=>{
    const classes=new Set();
    return {ownerDocument:document,value:'',children:[],dataset:{},
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)},add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}},
      append(...items){this.children.push(...items)},appendChild(item){this.children.push(item);return item},
      replaceChildren(...items){this.children=items},
      removeChild(item){this.children=this.children.filter(child=>child!==item)},
      focus(){document.activeElement=this},
      get textContent(){return this.children.map(x=>x.textContent).join('')},
      set textContent(value){this.replaceChildren(document.createTextNode(value))},
      setAttribute(){},removeAttribute(){},addEventListener(){},
      set innerHTML(value){this.children=[]},get innerHTML(){return ''}};
  };
  document.getElementById=id=>{if(!elements.has(id))elements.set(id,document.createElement());return elements.get(id)};
  return document;
}
