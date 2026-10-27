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

  var balance = 1240;
  var bet = 50;
  var spinning = false;
  var currentRotation = 0;
  var finishTimer = null;

  function fmt(n){ return n.toLocaleString("ru-RU").replace(/,/g," "); }

  function updateBalance(){ balanceEl.textContent = fmt(balance); }
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
  betInput.addEventListener("blur", function(){
    applyBetLive(true);
  });
  betInput.addEventListener("keydown", function(e){
    if (e.key === "Enter"){
      e.preventDefault();
      if (applyBetLive(false)) spin();
    }
  });

  /* ---------- feed ---------- */
  function multLabel(mult){ return mult === 0 ? "x0" : ("x" + mult); }
  function multClass(mult){ return mult === 0 ? "lose" : mult === 2 ? "win" : "jack"; }
  function multIcon(mult){ return mult === 0 ? "i-x" : mult === 2 ? "i-bolt" : "i-crown"; }

  function buildFeedRow(data, opts){
    var row = document.createElement("div");
    row.className = "feed-row" + (opts && opts.isNew ? " is-new enter" : "");
    var payout = data.mult * data.bet;
    var priceText = payout > 0 ? ("+ " + fmt(payout)) : ("− " + fmt(data.bet));
    var priceCls = multClass(data.mult);
    row.innerHTML =
      '<div class="feed-avatar ' + (data.mult === 3 ? "legend" : data.mult === 2 ? "rare" : "") + '">' +
        '<svg class="ico"><use href="#' + multIcon(data.mult) + '"/></svg>' +
      '</div>' +
      '<div class="feed-main">' +
        '<div class="feed-title">' + multLabel(data.mult) + ' · bet ' + fmt(data.bet) + '</div>' +
        '<div class="feed-sub">' +
          '<svg class="ico"><use href="#i-coin"/></svg>' +
          (opts && opts.isNew ? "You · just now" : (opts && opts.time ? opts.time : "just now")) +
        '</div>' +
      '</div>' +
      '<div class="feed-price ' + priceCls + '">' +
        '<svg class="ico"><use href="#' + (payout > 0 ? "i-coin" : "i-x") + '"/></svg> ' + priceText +
      '</div>';
    return row;
  }

  function seedFeed(){
    [
      { mult:3, bet:50,  time:"2 min ago" },
      { mult:2, bet:100, time:"4 min ago" },
      { mult:0, bet:50,  time:"7 min ago" }
    ].forEach(function(s){ feedList.appendChild(buildFeedRow(s, { time: s.time })); });
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

  /* ---------- center ---------- */
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

  /* ---------- spin ---------- */
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
    pushMyDrop({ mult: targetItem.mult, bet: betAtSpin });

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

  seedFeed();
  updateBalance();
  betCurrent.textContent = fmt(bet);
  updateSpinLabel();
})();
