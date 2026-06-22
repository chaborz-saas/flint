/* ============================================================
   REFONTE PAGE RECUP — renderVitaux() (angle "Pedagogique vert")
   Remplace integralement la fonction renderVitaux() de index.html
   (lignes ~2607-2631, de "function renderVitaux(){var host="
   jusqu'a son accolade fermante, juste avant "const BEHAVIORS=").
   Modele de donnees inchange : sensorOf, baseStat, getMetricStatus,
   fitnessAge, getProfile, openSleepNight, tk, gDay, V_MONTHS.
   ============================================================ */
function renderVitaux(){var host=document.getElementById('vitauxCard');if(!host)return;var t=sensorOf(tk());
 function r1(x){return Math.round(x*10)/10}
 var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+gDay);
 var H='<div class="nvh"><span class="nvhic"><i class="ti ti-moon-stars"></i></span><div class="nvht"><div class="nvtitle">Vitaux nocturnes</div><div class="nvsub">La zone verte = ta normale</div></div><span class="nvdate"><i class="ti ti-moon"></i> Nuit du '+d.getDate()+' '+V_MONTHS[d.getMonth()]+'</span></div>';
 if(!t||t.hrv==null){host.innerHTML=H+'<div class="nvcard"><p class="sci" style="margin:0;padding:4px 2px">En attente de ta nuit. Synchronise ta Polar Loop.</p></div>';return}

 // dir=+1 : haut = bon (HRV).  dir=-1 : bas = bon (FC repos, respiration).
 function semantics(field,st){var dir=field==='hrv'?1:-1;
  if(st==='na')return{tone:'na'};
  if(st==='in')return{tone:'good'};
  var fav=(st==='high'&&dir>0)||(st==='low'&&dir<0);
  return{tone:fav?'fav':'bad'};}

 var COPY={good:{lab:'Dans ta normale',ic:'ti-check'},
           fav :{lab:'Au top',ic:'ti-arrow-up-right'},
           bad :{lab:'À surveiller',ic:'ti-activity'}};

 function caption(field,st,tone){
  if(tone==='good')return 'Ton curseur est dans le vert — <b>tout est à l’équilibre</b>.';
  if(field==='hrv')return tone==='fav'
   ?'HRV <b>au-dessus de ta normale</b> : ton système nerveux est très bien récupéré.'
   :'HRV <b>sous ta normale</b> : signe de fatigue, lève le pied.';
  if(field==='rhr')return tone==='fav'
   ?'FC de repos <b>plus basse</b> que d’habitude : excellent signe de récupération.'
   :'FC de repos <b>plus haute</b> que d’habitude : ton cœur a moins récupéré.';
  return tone==='fav'
   ?'Respiration <b>plus calme</b> que ta normale : nuit très reposante.'
   :'Respiration <b>plus rapide</b> que ta normale : signal à surveiller.';
 }

 // Jauge : bande verte = [lo,hi], curseur = val. Labels sur 2 rangees (bornes / valeur).
 function bar(v,lo,hi,st,tone){
  var span=(hi-lo)||1,pad=span*0.55,
      amin=Math.min(lo,v)-pad,amax=Math.max(hi,v)+pad,rng=(amax-amin)||1;
  function pos(x){return Math.max(3,Math.min(97,(x-amin)/rng*100));}
  var bl=pos(lo),br=pos(hi),mk=pos(v);
  function edge(p){return p<=8?' edge-l':p>=92?' edge-r':'';}
  var loL='<span class="nvl'+edge(bl)+'" style="left:'+bl.toFixed(1)+'%">'+r1(lo)+'</span>',
      hiL='<span class="nvl'+edge(br)+'" style="left:'+br.toFixed(1)+'%">'+r1(hi)+'</span>',
      valRow=(st!=='in')
        ?'<div class="nvvalrow"><span class="nvl t-'+tone+edge(mk)+'" style="left:'+mk.toFixed(1)+'%">'+r1(v)+'</span></div>'
        :'';
  return '<div class="nvbarwrap"><div class="nvbar"><span class="nvtrack"></span>'
   +'<span class="nvband" style="left:'+bl.toFixed(1)+'%;width:'+Math.max(2,(br-bl)).toFixed(1)+'%"></span>'
   +'<span class="nvmk t-'+tone+'" style="left:'+mk.toFixed(1)+'%"></span></div>'
   +'<div class="nvlabels">'+loL+hiL+'</div>'+valRow+'</div>';
 }

 function metric(field,icon,name,val,unit){var b=baseStat(field);
  if(!b||val==null)return '<button class="nvcard" onclick="openSleepNight()"><div class="nvtop"><span class="nvic t-na"><i class="ti '+icon+'"></i></span><div class="nvhead"><div class="nvname">'+name+'</div><div class="nvval" style="color:#9A988F">—</div><div class="nvcap">Pas encore assez d’historique pour situer ta normale.</div></div><span class="nvchev"><i class="ti ti-chevron-right"></i></span></div></button>';
  var lo=b.m-b.sd,hi=b.m+b.sd,st=getMetricStatus(val,lo,hi),tone=semantics(field,st).tone,co=COPY[tone];
  return '<button class="nvcard" onclick="openSleepNight()"><div class="nvtop">'
   +'<span class="nvic t-'+tone+'"><i class="ti '+icon+'"></i></span>'
   +'<div class="nvhead"><div class="nvname">'+name+'</div>'
   +'<div class="nvval t-'+tone+'">'+val+'<small>'+unit+'</small></div>'
   +'<span class="nvverdict t-'+tone+'"><i class="ti '+co.ic+'"></i>'+co.lab+'</span>'
   +'</div><span class="nvchev t-'+tone+'"><i class="ti ti-chevron-right"></i></span></div>'
   +bar(val,lo,hi,st,tone)
   +'<div class="nvcap t-'+tone+'">'+caption(field,st,tone)+' Ta zone normale : '+r1(lo)+'–'+r1(hi)+' '+unit+'.</div>'
   +'</button>';
 }

 // Resume : "a surveiller" ne compte QUE les ecarts defavorables (bad).
 var bad=0,fav=0;
 [['hrv',t.hrv],['rhr',t.rhr],['resp',t.resp]].forEach(function(m){var b=baseStat(m[0]);if(!b||m[1]==null)return;
  var st=getMetricStatus(m[1],b.m-b.sd,b.m+b.sd),tn=semantics(m[0],st).tone;if(tn==='bad')bad++;else if(tn==='fav')fav++;});
 var sum;
 if(bad>0)sum='<div class="nvsum coral"><span class="si"><i class="ti ti-activity"></i></span><div class="st"><b>'+bad+' signal'+(bad>1?'s':'')+' à surveiller</b><span>Un ou plusieurs curseurs sont sortis du vert dans le mauvais sens cette nuit.</span></div><i class="ti ti-chevron-right sc"></i></div>';
 else if(fav>0)sum='<div class="nvsum green"><span class="si"><i class="ti ti-arrow-up-right"></i></span><div class="st"><b>Tout est normal — et même mieux</b><span>'+fav+' indicateur'+(fav>1?'s':'')+' au-dessus de ta normale : excellente récupération.</span></div><i class="ti ti-check sc green"></i></div>';
 else sum='<div class="nvsum green"><span class="si"><i class="ti ti-shield-check"></i></span><div class="st"><b>Tout est dans le vert</b><span>Tes signes vitaux nocturnes sont à l’équilibre.</span></div><i class="ti ti-check sc green"></i></div>';

 // Carte Age physiologique (conservee, alignee sur la tonalite)
 var age=fitnessAge(),uAge=getProfile().age||28,verdict,vtxt,tone;
 if(age==null){verdict='—';vtxt='';tone='na';}
 else if(age<=uAge-3){verdict='Excellent';vtxt='Ton corps récupère très bien.';tone='fav';}
 else if(age<=uAge+3){verdict='Dans ta normale';vtxt='Récupération dans la norme.';tone='good';}
 else{verdict='À surveiller';vtxt='Pense à plus de repos.';tone='bad';}
 var ageCard='<button class="nvcard" onclick="openSleepNight()"><div class="nvtop">'
  +'<span class="nvic t-'+tone+'"><i class="ti ti-user"></i></span>'
  +'<div class="nvhead"><div class="nvname">Âge physiologique</div>'
  +'<div class="nvval t-'+tone+'">'+(age!=null?age:'—')+'<small>ans</small></div>'
  +(verdict!=='—'?'<span class="nvverdict t-'+tone+'"><i class="ti '+(tone==='bad'?'ti-activity':tone==='fav'?'ti-arrow-up-right':'ti-check')+'"></i>'+verdict+'</span>':'')
  +(vtxt?'<div class="nvcap t-'+tone+'">'+vtxt+'</div>':'')
  +'</div><span class="nvchev t-'+tone+'"><i class="ti ti-chevron-right"></i></span></div></button>';

 host.innerHTML=H+sum
  +metric('hrv','ti-heartbeat','HRV',t.hrv,'ms')
  +metric('rhr','ti-heart','FC repos',t.rhr,'bpm')
  +metric('resp','ti-lungs','Respiration',t.resp,'/min')
  +ageCard;
}
