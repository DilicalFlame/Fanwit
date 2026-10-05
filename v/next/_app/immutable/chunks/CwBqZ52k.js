function l(e){e.commands.handle("hello.greet",({name:t})=>(e.notify.toast({title:`Hello, ${t}!`,kind:"success"}),{greeted:t}))}export{l as default};
