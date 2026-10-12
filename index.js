const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const http = require('http');
http.createServer((req,res)=>res.end('Apple Bot OK')).listen(process.env.PORT||10000);

let games = {};
const PHONE_NUMBER = "22890000000"; // <--- METS TON NUMÉRO ICI SANS + ex: 22890123456

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ["Ubuntu","Chrome","20"] });
  sock.ev.on('creds.update', saveCreds);

  if(!state.creds.registered) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log(`\n\n========================`);
        console.log(`TON CODE WHATSAPP: ${code}`);
        console.log(`Va dans WhatsApp > Appareils liés > Lier avec numéro de téléphone`);
        console.log(`Tape ce code: ${code}`);
        console.log(`========================\n\n`);
      } catch(e){ console.log("Erreur code:", e.message); }
    }, 3000);
  }

  sock.ev.on('connection.update', (u) => {
    if(u.connection==='open') console.log("✅ CONNECTE! Bot Apple prêt!");
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]; if(!msg.message || msg.key.fromMe) return;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
    const jid = msg.key.remoteJid;
    if(text==='menu' || text==='bonjour') { await sock.sendMessage(jid, { text: `🍎 APPLE EDUCATIF\nTape *jouer* pour commencer\n*proba* pour les maths` }); return; }
    if(text==='jouer') { games[jid]={level:1,mult:1,traps:[1,2,2,3,3],active:true}; await sock.sendMessage(jid, { text: `🚀 Étage 1/5 - Choisis 1-5\nChance 80%` }); return; }
    if(['1','2','3','4','5'].includes(text) && games[jid]) {
      let g=games[jid]; let trap=[]; while(trap.length<g.traps[g.level-1]){let r=Math.floor(Math.random()*5); if(!trap.includes(r)) trap.push(r);}
      if(trap.includes(parseInt(text)-1)){ await sock.sendMessage(jid, { text: `💀 Perdu niv ${g.level}\nPlateau:${[0,1,2,3,4].map(i=>trap.includes(i)?'💀':'🍎').join(' ')}\n*jouer*` }); delete games[jid]; }
      else{ g.mult+=0.7; g.level++; if(g.level>5){ await sock.sendMessage(jid, { text: `🏆 SOMMET x${g.mult.toFixed(2)}! Proba 4.6%` }); delete games[jid]; } else await sock.sendMessage(jid, { text: `🍎 SAFE x${g.mult.toFixed(2)}\nÉtage ${g.level}/5 - Choisis 1-5 ou *stop*` }); }
    }
  });
}
startBot();
