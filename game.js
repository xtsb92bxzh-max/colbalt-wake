const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const joystick = document.getElementById("joystick");
const stickThumb = document.getElementById("stickThumb");
const touchControls = document.querySelector(".touch-controls");
const boostTouch = document.getElementById("boostTouch");
const fireTouch = document.getElementById("fireTouch");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const threatEl = document.getElementById("threat");
const gemsEl = document.getElementById("gems");
const shotsEl = document.getElementById("shots");
const healthBar = document.querySelector("#healthBar span");

const W = canvas.width;
const H = canvas.height;
const GEMS_FOR_SHOT = 3;
const keys = new Set();
const touchInput = {
  active: false,
  boost: false,
  pointerId: null,
  x: 0,
  y: 0
};
const bestKey = "cobolt-wake-best";

const state = {
  mode: "start",
  time: 0,
  score: 0,
  best: Number(localStorage.getItem(bestKey) || 0),
  spawnTimer: 0,
  pickupTimer: 0,
  shake: 0,
  waveOffset: 0,
  threatLevel: 1,
  gems: 0,
  shots: 0,
  fireCooldown: 0,
  boat: null,
  orcas: [],
  pickups: [],
  projectiles: [],
  wakes: []
};

bestEl.textContent = state.best;

const audio = {
  splash: null,
  hit: null,
  pickup: null,
  gameOver: null
};

function playSound(name) {
  const sound = audio[name];
  if (sound) sound.currentTime = 0;
  if (sound?.play) sound.play().catch(() => {});
}

function resetGame() {
  state.mode = "playing";
  state.time = 0;
  state.score = 0;
  state.spawnTimer = 0;
  state.pickupTimer = 4;
  state.shake = 0;
  state.waveOffset = 0;
  state.threatLevel = 1;
  state.gems = 0;
  state.shots = 0;
  state.fireCooldown = 0;
  state.boat = {
    x: W * 0.5,
    y: H * 0.58,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    health: 100,
    boost: 100,
    boostCooldown: 0,
    radius: 8
  };
  state.orcas = [createOrca(true)];
  state.pickups = [createPickup("gem"), createPickup()];
  state.projectiles = [];
  state.wakes = [];
  overlay.classList.add("hidden");
  updateHud();
}

function createOrca(initial = false) {
  const side = Math.floor(Math.random() * 4);
  const margin = 18;
  const pos = [
    { x: -margin, y: Math.random() * H },
    { x: W + margin, y: Math.random() * H },
    { x: Math.random() * W, y: -margin },
    { x: Math.random() * W, y: H + margin }
  ][side];

  return {
    x: initial ? W * 0.22 : pos.x,
    y: initial ? H * 0.25 : pos.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 9,
    state: "patrol",
    timer: initial ? 1.3 : 0.4 + Math.random() * 1.3,
    warned: false,
    damaged: false,
    chargeSpeed: 70,
    targetX: W * 0.5,
    targetY: H * 0.5
  };
}

function createPickup(type = null) {
  const roll = Math.random();
  return {
    x: 24 + Math.random() * (W - 48),
    y: 32 + Math.random() * (H - 56),
    type: type || (roll < 0.5 ? "gem" : roll < 0.68 ? "repair" : "score"),
    bob: Math.random() * Math.PI * 2,
    radius: 7
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function addWake(x, y, color = "rgba(201, 255, 241, 0.68)", life = 0.7, size = 4) {
  state.wakes.push({ x, y, life, maxLife: life, size, color });
}

function update(dt) {
  state.waveOffset += dt * 18;

  if (state.mode !== "playing") {
    return;
  }

  state.time += dt;
  state.threatLevel = getThreatLevel();
  state.score += dt * 10;
  state.spawnTimer -= dt;
  state.pickupTimer -= dt;
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.shake = Math.max(0, state.shake - dt * 20);

  updateBoat(dt);
  updateProjectiles(dt);
  updateOrcas(dt);
  updatePickups(dt);
  updateWakes(dt);
  updateHud();
}

function getThreatLevel() {
  return clamp(1 + Math.floor(state.time / 20), 1, 8);
}

function getDifficulty() {
  const level = state.threatLevel;
  const smooth = state.time / 140;
  return {
    level,
    maxOrcas: clamp(1 + Math.floor((level - 1) / 2), 1, 5),
    patrolAccel: 16 + level * 2.5,
    warnTime: clamp(1.45 - level * 0.09, 0.62, 1.45),
    chargeSpeed: 88 + level * 13 + smooth * 18,
    recoverTime: clamp(1.05 - level * 0.055, 0.5, 1.05),
    spawnDelay: clamp(12 - level * 0.8, 4.5, 12),
    pickupLimit: level >= 6 ? 2 : 3,
    pickupDelay: clamp(6.5 - level * 0.35, 3.5, 6.5)
  };
}

function fireHarpoon() {
  if (state.mode !== "playing" || state.shots <= 0 || state.fireCooldown > 0) {
    return;
  }

  const boat = state.boat;
  state.shots -= 1;
  state.fireCooldown = 0.35;
  const speed = 185;
  const noseX = boat.x + Math.cos(boat.angle) * 11;
  const noseY = boat.y + Math.sin(boat.angle) * 11;
  state.projectiles.push({
    x: noseX,
    y: noseY,
    vx: Math.cos(boat.angle) * speed + boat.vx * 0.25,
    vy: Math.sin(boat.angle) * speed + boat.vy * 0.25,
    angle: boat.angle,
    radius: 4,
    life: 1.4
  });
  addWake(noseX, noseY, "rgba(255, 211, 107, 0.85)", 0.35, 5);
  updateHud();
}

function updateProjectiles(dt) {
  state.projectiles = state.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    addWake(shot.x, shot.y, "rgba(255, 211, 107, 0.34)", 0.25, 2);

    for (const orca of state.orcas) {
      if (distance(shot, orca) < shot.radius + orca.radius + 2) {
        repelOrca(orca, shot);
        state.score += 75;
        state.shake = 2;
        return false;
      }
    }

    return shot.life > 0 && shot.x > -16 && shot.x < W + 16 && shot.y > -16 && shot.y < H + 16;
  });
}

function repelOrca(orca, shot) {
  const angle = Math.atan2(orca.y - shot.y, orca.x - shot.x);
  orca.state = "recover";
  orca.timer = 1.2;
  orca.warned = false;
  orca.damaged = true;
  orca.vx = Math.cos(angle) * 95;
  orca.vy = Math.sin(angle) * 95;
  addWake(orca.x, orca.y, "rgba(255, 211, 107, 0.95)", 0.8, 13);
}

function updateBoat(dt) {
  const boat = state.boat;
  let ax = 0;
  let ay = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) ax -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) ax += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) ay -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) ay += 1;
  ax += touchInput.x;
  ay += touchInput.y;

  const moving = Math.hypot(ax, ay) > 0.05;
  let boostActive = false;
  if ((keys.has("Space") || touchInput.boost) && boat.boost > 0 && moving) {
    boostActive = true;
    boat.boost = Math.max(0, boat.boost - dt * 38);
    boat.boostCooldown = 0.6;
  } else {
    boat.boostCooldown = Math.max(0, boat.boostCooldown - dt);
    if (boat.boostCooldown === 0) {
      boat.boost = Math.min(100, boat.boost + dt * 20);
    }
  }

  if (moving) {
    const length = Math.hypot(ax, ay);
    ax /= length;
    ay /= length;
    boat.angle = Math.atan2(ay, ax);
  }

  const accel = boostActive ? 170 : 108;
  boat.vx += ax * accel * dt;
  boat.vy += ay * accel * dt;
  boat.vx *= Math.pow(0.08, dt);
  boat.vy *= Math.pow(0.08, dt);
  boat.x += boat.vx * dt;
  boat.y += boat.vy * dt;
  boat.x = clamp(boat.x, 12, W - 12);
  boat.y = clamp(boat.y, 18, H - 12);

  if (moving || Math.hypot(boat.vx, boat.vy) > 8) {
    addWake(boat.x - Math.cos(boat.angle) * 9, boat.y - Math.sin(boat.angle) * 9, "rgba(210, 255, 241, 0.42)", 0.5, 3);
  }
}

function updateOrcas(dt) {
  const difficulty = getDifficulty();
  if (state.orcas.length < difficulty.maxOrcas && state.spawnTimer <= 0) {
    state.orcas.push(createOrca());
    state.spawnTimer = difficulty.spawnDelay;
  }

  for (const orca of state.orcas) {
    orca.timer -= dt;
    if (orca.state === "patrol") {
      const dx = state.boat.x - orca.x;
      const dy = state.boat.y - orca.y;
      const angle = Math.atan2(dy, dx);
      orca.angle = angle;
      orca.vx += Math.cos(angle) * difficulty.patrolAccel * dt;
      orca.vy += Math.sin(angle) * difficulty.patrolAccel * dt;
      orca.vx *= Math.pow(0.18, dt);
      orca.vy *= Math.pow(0.18, dt);
      orca.x += orca.vx * dt;
      orca.y += orca.vy * dt;

      if (orca.timer <= 0) {
        orca.state = "warn";
        orca.timer = difficulty.warnTime;
        orca.warned = false;
        orca.damaged = false;
        orca.targetX = state.boat.x + state.boat.vx * 0.35;
        orca.targetY = state.boat.y + state.boat.vy * 0.35;
      }
    }

    if (orca.state === "warn") {
      orca.angle = Math.atan2(orca.targetY - orca.y, orca.targetX - orca.x);
      if (!orca.warned) {
        addWake(orca.targetX, orca.targetY, "rgba(240, 108, 61, 0.86)", 1.2, 15);
        orca.warned = true;
      }
      if (orca.timer <= 0) {
        orca.state = "charge";
        orca.timer = 1.25;
        orca.chargeSpeed = difficulty.chargeSpeed;
        const angle = Math.atan2(orca.targetY - orca.y, orca.targetX - orca.x);
        orca.vx = Math.cos(angle) * orca.chargeSpeed;
        orca.vy = Math.sin(angle) * orca.chargeSpeed;
        playSound("splash");
      }
    }

    if (orca.state === "charge") {
      orca.x += orca.vx * dt;
      orca.y += orca.vy * dt;
      orca.angle = Math.atan2(orca.vy, orca.vx);
      addWake(orca.x - Math.cos(orca.angle) * 10, orca.y - Math.sin(orca.angle) * 10, "rgba(210, 255, 241, 0.38)", 0.45, 5);

      if (!orca.damaged && distance(orca, state.boat) < orca.radius + state.boat.radius) {
        orca.damaged = true;
        state.boat.health = Math.max(0, state.boat.health - 28);
        state.shake = 4;
        playSound("hit");
        addWake(state.boat.x, state.boat.y, "rgba(255, 211, 107, 0.95)", 0.45, 9);
        if (state.boat.health <= 0) {
          endGame();
        }
      }

      if (orca.timer <= 0 || orca.x < -40 || orca.x > W + 40 || orca.y < -40 || orca.y > H + 40) {
        orca.state = "recover";
        orca.timer = difficulty.recoverTime + Math.random() * 0.35;
      }
    }

    if (orca.state === "recover") {
      orca.x += orca.vx * dt * 0.25;
      orca.y += orca.vy * dt * 0.25;
      if (orca.timer <= 0) {
        Object.assign(orca, createOrca());
      }
    }
  }
}

function updatePickups(dt) {
  const difficulty = getDifficulty();
  if (state.pickups.length < difficulty.pickupLimit && state.pickupTimer <= 0) {
    state.pickups.push(createPickup());
    state.pickupTimer = difficulty.pickupDelay + Math.random() * 2;
  }

  for (const pickup of state.pickups) {
    pickup.bob += dt * 4;
  }

  state.pickups = state.pickups.filter((pickup) => {
    if (distance(pickup, state.boat) < pickup.radius + state.boat.radius) {
      if (pickup.type === "repair") {
        state.boat.health = Math.min(100, state.boat.health + 22);
      } else if (pickup.type === "gem") {
        state.gems += 1;
        state.score += 35;
        if (state.gems >= GEMS_FOR_SHOT) {
          state.gems -= GEMS_FOR_SHOT;
          state.shots += 1;
          addWake(state.boat.x, state.boat.y, "rgba(200, 255, 241, 0.95)", 0.9, 14);
        }
      } else {
        state.score += 120;
      }
      playSound("pickup");
      addWake(pickup.x, pickup.y, "rgba(255, 211, 107, 0.9)", 0.7, 10);
      return false;
    }
    return true;
  });
}

function updateWakes(dt) {
  state.wakes = state.wakes.filter((wake) => {
    wake.life -= dt;
    wake.size += dt * 12;
    return wake.life > 0;
  });
}

function endGame() {
  state.mode = "gameover";
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem(bestKey, String(state.best));
  bestEl.textContent = state.best;
  overlayText.textContent = `Final score ${Math.floor(state.score)}. Cobolt is ready for another bolt through the blue.`;
  startButton.textContent = "Sail Again";
  overlay.classList.remove("hidden");
  playSound("gameOver");
  updateHud();
}

function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  bestEl.textContent = state.best;
  threatEl.textContent = state.threatLevel;
  gemsEl.textContent = `${state.gems}/${GEMS_FOR_SHOT}`;
  shotsEl.textContent = state.shots;
  healthBar.style.width = `${state.boat ? state.boat.health : 100}%`;
  touchControls.classList.toggle("is-visible", state.mode === "playing");
  fireTouch.classList.toggle("is-ready", state.mode === "playing" && state.shots > 0);
}

function draw() {
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(Math.round(shakeX), Math.round(shakeY));
  drawOcean();
  drawWakes();
  if (state.mode === "playing") {
    for (const pickup of state.pickups) drawPickup(pickup);
    for (const orca of state.orcas) drawOrca(orca);
    for (const shot of state.projectiles) drawProjectile(shot);
    drawBoat(state.boat);
    drawBoostMeter(state.boat);
  } else {
    drawAttractScene();
  }
  ctx.restore();
}

function drawOcean() {
  ctx.fillStyle = "#0f5b79";
  ctx.fillRect(-8, -8, W + 16, H + 16);

  for (let y = -12; y < H + 18; y += 18) {
    const offset = (state.waveOffset + y * 1.7) % 42;
    for (let x = -42; x < W + 42; x += 42) {
      ctx.fillStyle = "rgba(165, 247, 236, 0.24)";
      ctx.fillRect(Math.round(x + offset), y, 14, 2);
      ctx.fillStyle = "rgba(5, 32, 51, 0.25)";
      ctx.fillRect(Math.round(x + offset + 18), y + 8, 18, 2);
    }
  }
}

function drawWakes() {
  for (const wake of state.wakes) {
    const alpha = wake.life / wake.maxLife;
    ctx.strokeStyle = wake.color.replace(/[\d.]+\)$/u, `${0.75 * alpha})`);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(Math.round(wake.x), Math.round(wake.y), wake.size, wake.size * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBoat(boat) {
  ctx.save();
  ctx.translate(Math.round(boat.x), Math.round(boat.y));
  ctx.rotate(boat.angle + Math.PI / 2);

  ctx.fillStyle = "#5b3420";
  pixelRect(-5, -9, 10, 18);
  ctx.fillStyle = "#8a5637";
  pixelRect(-4, -7, 8, 14);
  ctx.fillStyle = "#f7efd2";
  pixelRect(-1, -12, 2, 20);
  ctx.fillStyle = "#fff4c7";
  pixelRect(1, -10, 7, 11);
  ctx.fillStyle = "#d8e9d1";
  pixelRect(-7, -7, 6, 9);
  ctx.fillStyle = "#071823";
  pixelRect(-3, 6, 6, 3);
  ctx.restore();
}

function drawOrca(orca) {
  ctx.save();
  ctx.translate(Math.round(orca.x), Math.round(orca.y));
  ctx.rotate(orca.angle);

  const flash = orca.state === "warn" && Math.floor(orca.timer * 8) % 2 === 0;
  ctx.fillStyle = flash ? "#f06c3d" : "#071823";
  pixelRect(-11, -5, 20, 10);
  pixelRect(-3, -9, 7, 4);
  pixelRect(6, -3, 8, 6);
  ctx.fillStyle = "#e8f2e5";
  pixelRect(-7, 1, 8, 4);
  ctx.fillStyle = "#071823";
  pixelRect(-14, -2, 4, 4);
  ctx.restore();
}

function drawPickup(pickup) {
  const y = Math.round(pickup.y + Math.sin(pickup.bob) * 2);
  if (pickup.type === "gem") {
    ctx.fillStyle = "#c8fff1";
    pixelRect(pickup.x - 3, y - 6, 6, 3);
    pixelRect(pickup.x - 5, y - 3, 10, 6);
    pixelRect(pickup.x - 3, y + 3, 6, 3);
    ctx.fillStyle = "#2fb7cc";
    pixelRect(pickup.x - 2, y - 2, 4, 4);
    return;
  }

  ctx.fillStyle = pickup.type === "repair" ? "#6ff096" : "#ffd36b";
  pixelRect(pickup.x - 5, y - 5, 10, 10);
  ctx.fillStyle = "#071823";
  pixelRect(pickup.x - 2, y - 2, 4, 4);
  ctx.fillStyle = "#fff8df";
  pixelRect(pickup.x - 1, y - 7, 2, 4);
}

function drawProjectile(shot) {
  ctx.save();
  ctx.translate(Math.round(shot.x), Math.round(shot.y));
  ctx.rotate(shot.angle);
  ctx.fillStyle = "#ffd36b";
  pixelRect(-5, -1, 10, 2);
  ctx.fillStyle = "#fff8df";
  pixelRect(3, -2, 4, 4);
  ctx.restore();
}

function drawBoostMeter(boat) {
  const x = 10;
  const y = H - 12;
  ctx.fillStyle = "#071823";
  pixelRect(x, y, 46, 5);
  ctx.fillStyle = "#c8fff1";
  pixelRect(x + 1, y + 1, Math.round(44 * (boat.boost / 100)), 3);
}

function drawAttractScene() {
  const fakeBoat = {
    x: W * 0.5,
    y: H * 0.58,
    angle: -Math.PI / 2
  };
  const fakeOrca = {
    x: W * 0.25,
    y: H * 0.42,
    angle: 0.35,
    state: "patrol",
    timer: 0
  };
  drawOrca(fakeOrca);
  drawBoat(fakeBoat);
}

function pixelRect(x, y, w, h) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function handleStart() {
  resetGame();
  startButton.textContent = "Cast Off";
}

startButton.addEventListener("click", handleStart);

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyF"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "Enter" && state.mode !== "playing") {
    handleStart();
    return;
  }
  if (event.code === "KeyF") {
    fireHarpoon();
    return;
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const max = rect.width * 0.36;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  const scale = length > max ? max / length : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  touchInput.x = knobX / max;
  touchInput.y = knobY / max;
  stickThumb.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function resetJoystick() {
  touchInput.active = false;
  touchInput.pointerId = null;
  touchInput.x = 0;
  touchInput.y = 0;
  stickThumb.style.transform = "translate(-50%, -50%)";
}

joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  touchInput.active = true;
  touchInput.pointerId = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});

joystick.addEventListener("pointermove", (event) => {
  if (!touchInput.active || touchInput.pointerId !== event.pointerId) return;
  event.preventDefault();
  updateJoystick(event);
});

joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);
joystick.addEventListener("lostpointercapture", resetJoystick);

boostTouch.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  touchInput.boost = true;
  boostTouch.classList.add("is-active");
  boostTouch.setPointerCapture(event.pointerId);
});

function releaseBoost() {
  touchInput.boost = false;
  boostTouch.classList.remove("is-active");
}

boostTouch.addEventListener("pointerup", releaseBoost);
boostTouch.addEventListener("pointercancel", releaseBoost);
boostTouch.addEventListener("lostpointercapture", releaseBoost);

fireTouch.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fireTouch.classList.add("is-active");
  fireHarpoon();
});

fireTouch.addEventListener("pointerup", () => {
  fireTouch.classList.remove("is-active");
});
fireTouch.addEventListener("pointercancel", () => {
  fireTouch.classList.remove("is-active");
});

updateHud();
requestAnimationFrame(loop);
