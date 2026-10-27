(function(){
  "use strict";

  var SECTORS = [
    { type:"black", mult:0 },
    { type:"blue",  mult:2 },
    { type:"black", mult:0 },
    { type:"gold",  mult:3 },
    { type:"black", mult:0 },
    { type:"blue",  mult:2 },
    { type:"black", mult:0 },
    { type:"blue",  mult:2 },
    { type:"black", mult:0 },
    { type:"gold",  mult:3 },
    { type:"black", mult:0 },
    { type:"blue",  mult:2 }
  ];
  var SECTOR_ANGLE = 360 / SECTORS.length;
  var MIN_BET = 10;
  var MAX_BET = 500;

  /* ---------- DOM ---------- */
  var feedList    = document.getElementById("feedList");
  var rotor       = document.getElementById("rotor");
  var spinBtn     = document.getElementById("spinBtn");
  var spinLabel   = document.getElementById("spinLabel");
  var wheelCenter = document.getElementById("wheelCenter");
  var balanceEl   = document.getElementById("balance");
  var betInput    = document.getElementById("betInput");
  var betWrap     = document.getElementById("betWrap");
  var betCurrent  = document.getElementById("betCurrent");
  var betMsg      = document.getElementById("betMsg");
  var tabbar      = document.getElementById("tabbar");

  var profileAvatar   = document.getElementById("profileAvatar");
  var profileName     = document.getElementById("profileName");
  var profileUsername = document.getElementById("profileUsername");
  var profileBalance  = document.getElementById("profileBalance");
  var profileIdEl     = document.getElementById("profileId");
  var copyIdBtn       = document.getElementById("copyIdBtn");

  /* ---------- STATE ---------- */
  var balance = 1240;
  var bet = 50;
  var spinning = false;
  var currentRotation = 0;
  var finishTimer = null;

  // Пока "фейковый" текущий юзер. Позже заменим данными из Telegram initData.
  var me = {
    id: 100000001,
    firstName: "Alex",
    lastName: "K.",
    username: "alexk",
    photoUrl: "" // если появится URL — покажем картинку
  };

  function fmt(n){ return n.toLocaleString("ru-RU").replace(/,/g," "); }

  /* ================= АВАТАРКИ ================= */
  // Стабильный цвет по строке
  function colorFromString(str){
    var h = 0;
    for (var i=0;i<str.length;i++){
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    var hue = h % 360;
    // два цвета одной палитры для градиента
    return {
      a: "hsl(" + hue + ", 42%, 38%)",
      b: "hsl(" + ((hue + 28) % 360) + ", 46%, 24%)"
    };
  }

  function initialsFromName(name){
    if (!name) return "?";
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }

  // Возвращает DOM-элемент аватара
  function makeAvatar(opts){
    var el = document.createElement("div");
    el.className = "avatar " + (opts.size || "");
    el.style.setProperty("--size", null); // размер задаётся классом
    var name = opts.name || "";
    var url  = opts.photoUrl || "";

    if (url){
      var img = document.createElement("img");
      img.src = url;
      img.alt = name;
      img.loading = "lazy";
      el.appendChild(img);
    } else {
      var c = colorFromString(name || "user");
      el.style.background = "linear-gradient(135deg, " + c.a + ", " + c.b + ")";
      el.textContent = initialsFromName(name);
    }
    return el;
  }

  // Заполнить существующий .avatar (для профиля)
  function fillAvatar(el, opts){
    el.innerHTML = "";
    if (opts.photoUrl){
      var img = document.createElement("img");
      img.src = opts.photoUrl;
      img.alt = opts.name || "";
      el.appendChild(img);
      return;
    }
    var c = colorFromString(opts.name || "user");
    el.style.background = "linear-gradient(135deg, " + c.a + ", " + c.b + ")";
    el.textContent = initialsFromName(opts.name || "");
  }

  /* ================= ПРОФИЛЬ ================= */
  function renderProfile(){
    var fullName = (me.firstName + " " + (me.lastName || "")).trim();
    profileName.textContent = fullName || "Anonymous";
    profileUsername.textContent = me.username ? ("@" + me.username) : "@—";
    profileBalance.textContent = fmt(balance);
    profileIdEl.textContent = String(me.id);
    fillAvatar(profileAvatar, { name: fullName, photoUrl: me.photoUrl });
  }

  copyIdBtn.addEventListener("click", function(){
    var text = String(me.id);
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        copyIdBtn.textContent = "Скопировано";
        setTimeout(function(){
          copyIdBtn.innerHTML = '<svg class="ico"><use href="#i-copy"/></svg> Скопировать ID';
        }, 1200);
      });
    } else {
      // fallback
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch(e){}
      document.body.removeChild(ta);
      copyIdBtn.textContent = "Скопировано";
      setTimeout(function(){
        copyIdBtn.innerHTML = '<svg class="ico"><use href="#i-copy"/></svg> Скопировать ID';
      }, 1200);
    }
  });

  /* ================= НАВИГАЦИЯ ================= */
  function setView(name){
    // скрыть все, показать нужный
    var views = document.querySelectorAll(".view");
    for (var i=0;i<views.length;i++){
      views[i].classList.toggle("is-active", views[i].id === ("view-" + name));
    }
    // активный таб
    var tabs = tabbar.querySelectorAll(".tab");
    for (var j=0;j<tabs.length;j++){
      tabs[j].classList.toggle("active", tabs[j].getAttribute("data-view") === name);
    }
    if (name === "profile") renderProfile();
  }

  tabbar.addEventListener("click", function(e){
    var link = e.target.closest(".tab");
    if (!link) return;
    e.preventDefault();
    var view = link.getAttribute("data-view");
    if (view === "inventory" || view === "top"){
      // пока заглушки: просто остаёмся на Play
      // (позже добавим экраны)
      return;
    }
    setView(view);
  });

  /* ================= FEED ================= */
  function multLabel(mult){ return mult === 0 ? "x0" : ("x" + mult); }
  function multClass(mult){ return mult === 0 ? "lose" : mult === 2 ? "win" : "jack"; }
  function multIcon(mult){ return mult === 0 ? "i-x" : mult === 2 ? "i-bolt" : "i-crown"; }

  // Данные людей для ленты. Пока демо. Позже — из бэкенда.
  var DEMO_USERS = [
    { name:"Frog Lover",  username:"froglover",  photoUrl:"" },
    { name:"Duck Hunter", username:"duckhunter", photoUrl:"" },
    { name:"Gorilla",     username:"gorilla_gg", photoUrl:"" },
    { name:"Snake Eyes",  username:"snakeeyes",  photoUrl:"" },
    { name:"Tiger",       username:"tigerwin",   photoUrl:"" },
    { name:"King",        username:"kingdrop",   photoUrl:"" },
    { name:"Owl",         username:"owlwise",    photoUrl:"" },
    { name:"Wolf",        username:"wolfpack",   photoUrl:"" }
  ];

  function buildFeedRow(data, opts){
    var row = document.createElement("div");
    row.className = "feed-row" + (opts && opts.isNew ? " is-new enter" : "");

    var payout = data.mult * data.bet;
    var priceText = payout > 0 ? ("+ " + fmt(payout)) : ("− " + fmt(data.bet));
    var priceCls = multClass(data.mult);

    // аватар: если isNew и есть me — мой, иначе из DEMO_USERS
    var user = data.user || null;
    var avatarName = user ? user.name : (data.userName || "Player");
    var avatarUrl  = user ? user.photoUrl : (data.photoUrl || "");
    var avatar = makeAvatar({ name: avatarName, photoUrl: avatarUrl, size: "avatar-md" });

    var titleText = user
      ? (user.name || "Player") + " · " + multLabel(data.mult)
      : (data.userName || "Player") + " · " + multLabel(data.mult);

    row.appendChild(avatar);

    var main = document.createElement("div");
    main.className = "feed-main";
    main.innerHTML =
      '<div class="feed-title">' + titleText + '</div>' +
      '<div class="feed-sub">' +
        '<svg class="ico"><use href="#i-coin"/></svg>' +
        (opts && opts.isNew ? "You · just now" : (opts && opts.time ? opts.time : "just now")) +
      '</div>';
    row.appendChild(main);

    var price = document.createElement("div");
    price.className = "feed-price " + priceCls;
    price.innerHTML =
      '<svg class="ico"><use href="#' + (payout > 0 ? "i-coin" : "i-x") + '"/></svg> ' + priceText;
    row.appendChild(price);

    return row;
  }

  function seedFeed(){
    var seed = [
      { mult:3, bet:50,  time:"2 min ago", user: DEMO_USERS[5] },
      { mult:2, bet:100, time:"4 min ago", user: DEMO_USERS[2] },
      { mult:0, bet:50,  time:"7 min ago", user: DEMO_USERS[0] }
    ];
    seed.forEach(function(s){ feedList.appendChild(buildFeedRow(s, { time: s.time })); });
  }

  function pushMyDrop(data){
    var row = buildFeedRow(data, { isNew: true });
    feedList.prepend(row);

    var rows = Array.prototype.slice.call(feedList.children);
    if (rows.length > 4){
      var last = rows[rows.length - 1];
      last.classList.add("leave");
      setTimeout(function(){ if (last.parentNode) last.parentNode.removeChild(last); }, 360);
    }
    setTimeout(function(){ row.classList.remove("is-new"); }, 2500);
  }

  /* ================= WHEEL CENTER ================= */
  function setCenterIdle(){
    wheelCenter.classList.remove("result");
    wheelCenter.innerHTML =
      '<svg class="ico"><use href="#i-target"/></svg>' +
      '<span class="label">Ready</span>' +
      '<span class="value">Place bet</span>';
  }
  function setCenterSpinning(){
    wheelCenter.classList.remove("result");
    wheelCenter.innerHTML =
      '<svg class="ico"><use href="#i-spin"/></svg>' +
      '<span class="label">Spinning</span>' +
      '<span class="value">…</span>';
  }
  function setCenterResult(sector, payout){
    wheelCenter.classList.add("result");
    var icon = sector.mult === 0 ? "i-x" : sector.mult === 2 ? "i-bolt" : "i-crown";
    var label = sector.mult === 0 ? "You lose" : "You won";
    var value = sector.mult === 0 ? ("− " + fmt(bet)) : ("+ " + fmt(payout));
    wheelCenter.innerHTML =
      '<svg class="ico"><use href="#' + icon + '"/></svg>' +
      '<span class="label">' + label + '</span>' +
      '<span class="value">' + value + '</span>' +
      '<span class="result-name">' + multLabel(sector.mult) + '</span>';
  }

  function pickRandomIndex(){
    var weights = SECTORS.map(function(s){
      return s.type === "gold" ? 2 : s.type === "blue" ? 4 : 6;
    });
    var total = weights.reduce(function(a,b){ return a+b; }, 0);
    var r = Math.random() * total;
    for (var i=0;i<weights.length;i++){
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  /* ================= BET ================= */
  function updateBalance(){
    balanceEl.textContent = fmt(balance);
    profileBalance.textContent = fmt(balance);
  }
  function updateSpinLabel(){ spinLabel.textContent = "Spin · " + fmt(bet) + " gram"; }
  function setBetMsg(text, cls){
    betMsg.textContent = text || "";
    betMsg.className = cls || "";
  }

  function validateBetValue(raw){
    var v = parseInt(raw, 10);
    if (!raw || isNaN(v)) return { ok:false, err:"Введите ставку" };
    if (v < MIN_BET) return { ok:false, err:"Мин. " + MIN_BET };
    if (v > MAX_BET) return { ok:false, err:"Макс. " + MAX_BET };
    if (v > balance) return { ok:false, err:"Недостаточно средств" };
    return { ok:true, value:v };
  }

  function applyBetLive(silent){
    if (spinning) return false;
    var res = validateBetValue(betInput.value);
    if (!res.ok){
      betWrap.classList.add("invalid");
      if (!silent) setBetMsg(res.err, "err");
      return false;
    }
    betWrap.classList.remove("invalid");
    bet = res.value;
    betCurrent.textContent = fmt(bet);
    updateSpinLabel();
    if (!silent) setBetMsg("", "");
    return true;
  }

  betInput.addEventListener("input", function(){
    betWrap.classList.remove("invalid");
    setBetMsg("", "");
  });
  betInput.addEventListener("blur", function(){ applyBetLive(true); });
  betInput.addEventListener("keydown", function(e){
    if (e.key === "Enter"){
      e.preventDefault();
      if (applyBetLive(false)) spin();
    }
  });

  /* ================= SPIN ================= */
  function finishSpin(targetItem, betAtSpin){
    if (!spinning) return;
    spinning = false;
    if (finishTimer){ clearTimeout(finishTimer); finishTimer = null; }

    spinBtn.disabled = false;
    updateSpinLabel();

    var payout = targetItem.mult * betAtSpin;
    if (payout > 0) balance += payout;
    updateBalance();

    setCenterResult(targetItem, payout);

    var fullName = (me.firstName + " " + (me.lastName || "")).trim();
    pushMyDrop({
      mult: targetItem.mult,
      bet: betAtSpin,
      user: { name: fullName, username: me.username, photoUrl: me.photoUrl }
    });

    setTimeout(function(){ if (!spinning) setCenterIdle(); }, 2500);
  }

  function spin(){
    if (spinning) return;
    if (!applyBetLive(false)) return;

    spinning = true;
    spinBtn.disabled = true;
    spinLabel.textContent = "Spinning…";
    setBetMsg("", "");

    balance -= bet;
    updateBalance();
    setCenterSpinning();

    var idx = pickRandomIndex();
    var targetItem = SECTORS[idx];
    var betAtSpin = bet;

    var sectorCenter = idx * SECTOR_ANGLE + SECTOR_ANGLE / 2;
    var extraTurns = 6 + Math.floor(Math.random() * 3);
    var jitter = (Math.random() - 0.5) * (SECTOR_ANGLE * 0.6);

    var base = currentRotation - (currentRotation % 360);
    var desired = base + extraTurns * 360 + (360 - sectorCenter) + jitter;
    currentRotation = desired;

    var duration = 4200 + Math.random() * 800;
    void rotor.offsetWidth;

    rotor.style.transition = "transform " + duration + "ms cubic-bezier(.12,.72,.12,1)";
    rotor.style.transform = "rotate(" + currentRotation + "deg)";

    finishTimer = setTimeout(function(){ finishSpin(targetItem, betAtSpin); }, duration + 80);

    var onEnd = function(e){
      if (e.target !== rotor) return;
      rotor.removeEventListener("transitionend", onEnd);
      finishSpin(targetItem, betAtSpin);
    };
    rotor.addEventListener("transitionend", onEnd);
  }

  spinBtn.addEventListener("click", spin);

  /* ================= INIT ================= */
  seedFeed();
  updateBalance();
  betCurrent.textContent = fmt(bet);
  updateSpinLabel();
  renderProfile();
})();
