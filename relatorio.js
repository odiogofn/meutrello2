const apiKey   = "4ba1b3a8270aa12804e3ea96f5af088c";
const apiToken = "ATTAc15f31b2e807164ed11400ce511dc02f27d2c5e4a5bbedc6c8e897c7e378b377A2530AE5";
const apiBase  = "https://api.trello.com/1";

// ========= DOM ELEMENTS =========
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

// ========= API HELPERS =========
async function apiGet(url){
  const s = url.includes("?") ? "&" : "?";
  const r = await fetch(`${apiBase}${url}${s}key=${apiKey}&token=${apiToken}`);
  return r.json();
}

function getCreatedDateFromId(id){
  return new Date(parseInt(id.substring(0,8),16)*1000);
}

function trelloColor(name){
  const c = {green:"#61BD4F",yellow:"#F2D600",orange:"#FF9F1A",red:"#EB5A46",
             purple:"#C377E0",blue:"#0079BF",sky:"#00C2E0",lime:"#51E898",
             pink:"#FF78CB",black:"#4D4D4D"};
  return c[name]||"#7a7a7a";
}

async function getCardComments(id){
  const c = await apiGet(`/cards/${id}/actions?filter=commentCard`);
  return c.map(x=>({
    author:x.memberCreator?.fullName||"Usuário",
    text:x.data?.text||"",
    date:new Date(x.date)
  }));
}

// ========= MARKDOWN RENDER =========
function renderMarkdown(text) {
  if (!text) return "—";
  return DOMPurify.sanitize(marked.parse(text));
}

// ========= LOAD BOARDS =========
async function loadBoards(){
  const boards = await apiGet(`/members/me/boards`);
  boardSelect.innerHTML =
    `<option value="">Selecione...</option>`+
    boards.map(b=>`<option value="${b.id}">${b.name}</option>`).join("");
}
loadBoards();

// ========= BOARD CHANGE =========
boardSelect.addEventListener("change", async ()=>{
  const b = boardSelect.value;
  listSelect.innerHTML=`<option>Carregando...</option>`;
  labelFilter.innerHTML=`<option>Carregando...</option>`;

  const lists = await apiGet(`/boards/${b}/lists`);
  listSelect.innerHTML = `<option value="all">Todas</option>`+
    lists.map(l=>`<option value="${l.id}">${l.name}</option>`).join("");

  const labels = await apiGet(`/boards/${b}/labels`);
  labelFilter.innerHTML = `<option value="all">Todas</option>`+
    labels.map(l=>`<option value="${l.id}">${l.name}</option>`).join("");
});

clearDates.onclick =()=>{dateStartInp.value="";dateEndInp.value="";};

// ========= LOAD REPORT =========
loadReport.onclick = async ()=>{

  const board = boardSelect.value;
  if(!board) return alert("Selecione o quadro");

  reportContainer.innerHTML = "⏳ Carregando...";

  const [lists, cards, labels, members] = await Promise.all([
    apiGet(`/boards/${board}/lists`),
    apiGet(`/boards/${board}/cards?attachments=true&fields=id,name,desc,idList,idMembers,idLabels,shortUrl,dateLastActivity`),
    apiGet(`/boards/${board}/labels`),
    apiGet(`/boards/${board}/members`)
  ]);

  cards.forEach(c=>c.createdAt=getCreatedDateFromId(c.id));

  let filtered = [...cards];

  if(listSelect.value!=="all")
    filtered = filtered.filter(c=>c.idList===listSelect.value);

  if(labelFilter.value!=="all")
    filtered=filtered.filter(c=>c.idLabels.includes(labelFilter.value));

  const q = searchInput.value.toLowerCase();
  if(q) filtered = filtered.filter(c=>c.name.toLowerCase().includes(q));

  const s = dateStartInp.value?new Date(dateStartInp.value):null;
  const e = dateEndInp.value?new Date(dateEndInp.value):null;

  if(s||e){
    filtered = filtered.filter(c=>{
      const d = dateMode.value==="created"?c.createdAt:new Date(c.dateLastActivity);
      if(s && d<s) return false;
      if(e && d>e) return false;
      return true;
    });
  }

  filtered.sort((a,b)=> new Date(b.dateLastActivity)-new Date(a.dateLastActivity));
  exportBtns.style.display = filtered.length?"flex":"none";

  let html="";

  for(const card of filtered){

    const cardComments = await getCardComments(card.id);
    const listName = lists.find(l=>l.id===card.idList)?.name || "-";
    const labelsHTML = card.idLabels.map(id=>{
      const l = labels.find(x=>x.id===id);
      return l?`<span class="tag" style="background:${trelloColor(l.color)}">${l.name}</span>`:"";
    }).join("");

    const membersHTML = card.idMembers.map(id=>{
      const m = members.find(x=>x.id===id);
      return m?`<span class="member-chip">${m.fullName}</span>`:"";
    }).join("");

    const attachments = (card.attachments||[])
      .map(a=>`<a href="${a.url}" target="_blank">${a.name}</a>`).join("<br>")||"—";

    const commentsHTML = cardComments.length
      ? cardComments.sort((a,b)=>b.date-a.date).map(c=>`
            <div class="comment-block">
              <b>${c.author}</b> <span class="cdate">(${c.date.toLocaleString()})</span><br>
              ${renderMarkdown(c.text)}
            </div>`).join("")
      : "<i>Sem comentários</i>";

    html += `
<div class="report-card" id="card-${card.id}">
  <div class="report-title">📌 ${card.name}</div>

  ${labelsHTML} ${membersHTML}

  <div class="info-row"><b>Lista:</b> ${listName}</div>
  <div class="info-row"><b>Criado:</b> ${card.createdAt.toLocaleString()}</div>
  <div class="info-row"><b>Atualizado:</b> ${new Date(card.dateLastActivity).toLocaleString()}</div>

  <div class="subtitle">📝 Descrição</div>
  <div class="section-content open" style="display:block;">
    ${renderMarkdown(card.desc)}
  </div>

  <div class="section-toggle" data-target="cmt-${card.id}">💬 Comentários (${cardComments.length})</div>
  <div id="cmt-${card.id}" class="section-content">${commentsHTML}</div>

  <div class="section-toggle" data-target="att-${card.id}">📎 Anexos</div>
  <div id="att-${card.id}" class="section-content">${attachments}</div>

  <div class="report-actions">
    <a href="${card.shortUrl}" target="_blank">🔗 Trello</a>
    <button onclick="printCard('${card.id}')">🖨️ Imprimir</button>
    <button onclick="exportCardExcel('${card.id}')">📊 Excel</button>
    <button onclick="exportCardWord('${card.id}')">📝 Word</button>
  </div>
</div>`;
  }

  reportContainer.innerHTML = html;
};

// ========= Toggle Sections =========
document.addEventListener('click',(e)=>{
  const t = e.target.closest('.section-toggle');
  if(!t) return;
  const id = t.getAttribute('data-target');
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle("open");
  t.classList.toggle("active");
});

// ========= Export =========
document.getElementById("exportExcel").onclick = ()=>{
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.table_to_sheet(reportContainer);
  XLSX.utils.book_append_sheet(wb,ws,"Relatorio");
  XLSX.writeFile(wb,"relatorio_trello.xlsx");
};

document.getElementById("exportWord").onclick = ()=>{
  const blob=new Blob(['\ufeff',reportContainer.innerHTML],{type:"application/msword"});
  saveAs(blob,"relatorio_trello.doc");
};

document.getElementById("exportPdf").onclick = ()=> window.print();

// ========= Print one =========
function printCard(id){
  const w=window.open("","_blank");
  w.document.write(`<html><body>${document.getElementById("card-"+id).outerHTML}</body></html>`);
  w.print(); w.close();
}

function exportCardExcel(id){
  const el=document.getElementById("card-"+id);
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.table_to_sheet(el);
  XLSX.utils.book_append_sheet(wb,ws,"Card");
  XLSX.writeFile(wb,`card_${id}.xlsx`);
}

function exportCardWord(id){
  const html=document.getElementById("card-"+id).outerHTML;
  const blob=new Blob(['\ufeff',html],{type:"application/msword"});
  saveAs(blob,`card_${id}.doc`);
}
