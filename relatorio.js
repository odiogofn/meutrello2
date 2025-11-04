const apiKey = "4ba1b3a8270aa12804e3ea96f5af088c";
const apiToken = "ATTAc15f31b2e807164ed11400ce511dc02f27d2c5e4a5bbedc6c8e897c7e378b377A2530AE5";
const apiBase = "https://api.trello.com/1";

const boardSelect = document.getElementById("boardSelect");
const listSelect = document.getElementById("listSelect");
const labelFilter = document.getElementById("labelFilter");
const searchInput = document.getElementById("searchInput");
const dateMode = document.getElementById("dateMode");
const dateStartInp = document.getElementById("dateStart");
const dateEndInp = document.getElementById("dateEnd");
const clearDates = document.getElementById("clearDates");
const loadReport = document.getElementById("loadReport");
const reportContainer = document.getElementById("reportContainer");
const exportBtns = document.getElementById("exportBtns");

async function apiGet(url){
  const sep=url.includes("?")?"&":"?";
  const res = await fetch(`${apiBase}${url}${sep}key=${apiKey}&token=${apiToken}`);
  return res.json();
}

function getCreatedDateFromId(id){return new Date(parseInt(id.substring(0,8),16)*1000);}

function trelloColor(name){
  const c = {green:"#61BD4F",yellow:"#F2D600",orange:"#FF9F1A",red:"#EB5A46",purple:"#C377E0",blue:"#0079BF",
  sky:"#00C2E0",lime:"#51E898",pink:"#FF78CB",black:"#4D4D4D"};
  return c[name]||"#7a7a7a";
}

async function getCardComments(id){
  const c = await apiGet(`/cards/${id}/actions?filter=commentCard`);
  return c.map(x=>({author:x.memberCreator?.fullName||"Usuário",text:x.data?.text||"",date:new Date(x.date)}));
}

function renderMarkdown(t){return DOMPurify.sanitize(marked.parse(t||"—"));}

async function loadBoards(){
  const boards = await apiGet(`/members/me/boards`);
  boardSelect.innerHTML=`<option value="">Selecione...</option>`+
    boards.map(b=>`<option value="${b.id}">${b.name}</option>`).join("");
}
loadBoards();

boardSelect.addEventListener("change",async()=>{
  const id = boardSelect.value;
  const lists = await apiGet(`/boards/${id}/lists`);
  listSelect.innerHTML=`<option value="all">Todas</option>`+
    lists.map(x=>`<option value="${x.id}">${x.name}</option>`).join("");

  const labels = await apiGet(`/boards/${id}/labels`);
  labelFilter.innerHTML=`<option value="all">Todas</option>`+
    labels.map(x=>`<option value="${x.id}">${x.name}</option>`).join("");
});

clearDates.onclick = ()=>{dateStartInp.value="";dateEndInp.value="";};

loadReport.onclick = async ()=>{
  const board = boardSelect.value;
  if(!board) return alert("Selecione o quadro");

  reportContainer.innerHTML="⏳ Carregando...";

  const [lists,cards,labels,members]=await Promise.all([
    apiGet(`/boards/${board}/lists`),
    apiGet(`/boards/${board}/cards?attachments=true&fields=id,name,desc,idList,idMembers,idLabels,shortUrl,dateLastActivity`),
    apiGet(`/boards/${board}/labels`),
    apiGet(`/boards/${board}/members`)
  ]);

  cards.forEach(c=>c.createdAt=getCreatedDateFromId(c.id));
  let f=[...cards];

  if(listSelect.value!=="all") f=f.filter(c=>c.idList===listSelect.value);
  if(labelFilter.value!=="all") f=f.filter(c=>c.idLabels.includes(labelFilter.value));

  const q=searchInput.value.toLowerCase();
  if(q) f=f.filter(c=>c.name.toLowerCase().includes(q));

  const s=dateStartInp.value?new Date(dateStartInp.value):null;
  const e=dateEndInp.value?new Date(dateEndInp.value):null;

  if(s||e) f=f.filter(c=>{
    const d=dateMode.value==="created"?c.createdAt:new Date(c.dateLastActivity);
    if(s&&d<s) return false;
    if(e&&d>e) return false;
    return true;
  });

  f.sort((a,b)=>new Date(b.dateLastActivity)-new Date(a.dateLastActivity));
  exportBtns.style.display=f.length?"flex":"none";

  let html="";
  for(const c of f){
    const comments = await getCardComments(c.id);
    const L = lists.find(l=>l.id===c.idList)?.name||"-";
    const lbls=c.idLabels.map(id=>{
      const L=labels.find(x=>x.id===id);
      return L?`<span class="tag" style="background:${trelloColor(L.color)}">${L.name}</span>`:"";
    }).join("");
    const mbs=c.idMembers.map(id=>{
      const m=members.find(x=>x.id===id);
      return m?`<span class="member-chip">${m.fullName}</span>`:"";
    }).join("");
    const att=(c.attachments||[]).map(a=>`<a href="${a.url}" target="_blank">${a.name}</a>`).join("<br>") || "—";
    const comHTML = comments.length ?
      comments.map(cm=>`
        <div class="comment-block">
          <b>${cm.author}</b> <span class="cdate">(${cm.date.toLocaleString()})</span><br>
          ${renderMarkdown(cm.text)}
        </div>`).join("")
      : "<i>Sem comentários</i>";

    html+=`
<div class="report-card">
  <div class="report-title">📌 ${c.name}</div>
  ${lbls} ${mbs}
  <div class="info-row"><b>Lista:</b> ${L}</div>
  <div class="info-row"><b>Criado:</b> ${c.createdAt.toLocaleString()}</div>
  <div class="info-row"><b>Atualizado:</b> ${new Date(c.dateLastActivity).toLocaleString()}</div>

  <div class="subtitle">📝 Descrição</div>
  <div class="section-content open" style="display:block;">
    ${renderMarkdown(c.desc)}
  </div>

  <div class="section-toggle" data-target="cmt-${c.id}">💬 Comentários (${comments.length})</div>
  <div id="cmt-${c.id}" class="section-content">${comHTML}</div>

  <div class="section-toggle" data-target="att-${c.id}">📎 Anexos</div>
  <div id="att-${c.id}" class="section-content">${att}</div>

  <div class="report-actions">
    <a href="${c.shortUrl}" target="_blank">🔗 Trello</a>
    <button onclick="printCard('${c.id}')">🖨️</button>
  </div>
</div>`;
  }
  reportContainer.innerHTML=html;
};

document.addEventListener("click",e=>{
  const t=e.target.closest(".section-toggle");
  if(!t)return;
  const id=t.getAttribute("data-target");
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.toggle("open");
  t.classList.toggle("active");
});

/* EXPORTS */
document.getElementById("exportExcel").onclick=()=>{
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.table_to_sheet(reportContainer);
  XLSX.utils.book_append_sheet(wb,ws,"Relatorio");
  XLSX.writeFile(wb,"relatorio_trello.xlsx");
};

document.getElementById("exportWord").onclick=()=>{
  const blob=new Blob(['\ufeff',reportContainer.innerHTML],{type:"application/msword"});
  saveAs(blob,"relatorio_trello.doc");
};

/* PRINT */
document.getElementById("btnPrintTimbrado").onclick=()=>window.print();

document.getElementById("btnPrintSimples").onclick=()=>{
  document.body.classList.add("print-simple");
  window.print();
  setTimeout(()=>document.body.classList.remove("print-simple"),500);
};

/* PDF */
document.getElementById("btnPdfTimbrado").onclick=()=>{
  document.querySelector(".print-header").style.display="block";
  document.querySelector(".print-footer").style.display="block";
  const opt={margin:10,filename:`Relatorio_Timbrado_${Date.now()}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}};
  html2pdf().set(opt).from(document.body).save().then(()=>{
    document.querySelector(".print-header").style.display="none";
    document.querySelector(".print-footer").style.display="none";
  });
};

document.getElementById("btnPdfSimples").onclick=()=>{
  document.body.classList.add("print-simple");
  const opt={margin:10,filename:`Relatorio_Simples_${Date.now()}.pdf`,html2canvas:{scale:2},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}};
  html2pdf().set(opt).from(document.body).save().then(()=>{
    document.body.classList.remove("print-simple");
  });
};

/* PRINT ONE CARD */
function printCard(id){
  const el = document.getElementById(id);
  const w = window.open("");
  w.document.write(`<html><body>${el.outerHTML}</body></html>`);
  w.print();
  w.close();
}
