import{runSvelte as s}from"./D6-WvEgY.js";const a=r=>{if(typeof r=="string")return r;if(r===void 0)return"undefined";if(r instanceof Error)return`${r.name}: ${r.message}`;try{return JSON.stringify(r,(i,n)=>typeof n=="bigint"?`${n}n`:n===void 0?"undefined":n)??String(r)}catch{return String(r)}},l=3;async function g(r,i,n){const t=o=>(...e)=>n(o,e.map(a).join(" "));globalThis.__fw_console={log:t("log"),info:t("log"),warn:t("error"),error:t("error"),table:t("log")};const c=`<script${i?' lang="ts"':""}>
const console = globalThis.__fw_console;
(async () => {
${r}
})().catch((e) => console.error(e));
<\/script>`;try{return await s(c,document.createElement("div"))}catch(o){const e=o;throw e.line&&(e.line=Math.max(1,e.line-l)),e}}export{g as runScript};
