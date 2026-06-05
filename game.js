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
const mineTouch = document.getElementById("mineTouch");
const shieldHud = document.getElementById("shieldHud");
const shieldTimeEl = document.getElementById("shieldTime");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const threatEl = document.getElementById("threat");
const gemsEl = document.getElementById("gems");
const shotsEl = document.getElementById("shots");
const propEl = document.getElementById("prop");
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
  obstacleTimer: 0,
  helicopterTimer: 0,
  shake: 0,
  waveOffset: 0,
  threatLevel: 1,
  gems: 0,
  shots: 0,
  fireCooldown: 0,
  propFoulTimer: 0,
  boat: null,
  orcas: [],
  pickups: [],
  obstacles: [],
  helicopters: [],
  projectiles: [],
  mines: [],
  wakes: [],
  bossAnnounce: 0
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
  state.obstacleTimer = 10;
  state.helicopterTimer = 22;
  state.shake = 0;
  state.waveOffset = 0;
  state.threatLevel = 1;
  state.gems = 0;
  state.shots = 0;
  state.fireCooldown = 0;
  state.propFoulTimer = 0;
  state.bossAnnounce = 0;
  state.boat = {
    x: W * 0.5,
    y: H * 0.58,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    health: 100,
    boost: 100,
    boostCooldown: 0,
    shieldTimer: 0,
    radius: 8
  };
  state.orcas = [createOrca(true)];
  state.pickups = [createPickup("gem"), createPickup()];
  state.obstacles = [];
  state.helicopters = [];
  state.projectiles = [];
  state.mines = [];
  state.wakes = [];
  overlay.classList.add("hidden");
  updateHud();
}

function createOrca(initial = false, boss = false) {
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
    radius: boss ? 18 : 9,
    state: "patrol",
    timer: initial ? 1.3 : 0.4 + Math.random() * 1.3,
    warned: false,
    damaged: false,
    chargeSpeed: 70,
    isBoss: boss,
    health: boss ? 2 : 1,
    hitFlash: 0,
    dead: false,
    targetX: W * 0.5,
    targetY: H * 0.5
  };
}

function createPickup(type = null, x = null, y = null) {
  const roll = Math.random();
  const rolledType =
    state.threatLevel >= 4 && roll < 0.05
      ? "shield"
      : roll < 0.5 ? "gem" : roll < 0.68 ? "repair" : "score";
  return {
    x: x ?? 24 + Math.random() * (W - 48),
    y: y ?? 32 + Math.random() * (H - 56),
    type: type || rolledType,
    bob: Math.random() * Math.PI * 2,
    radius: 7
  };
}

function createObstacle(type = null) {
  const obstacle = {
    x: 24 + Math.random() * (W - 48),
    y: 34 + Math.random() * (H - 62),
    type: type || (Math.random() < 0.5 ? "seaweed" : "lobster"),
    bob: Math.random() * Math.PI * 2,
    life: 30,
    radius: 10
  };

  if (state.boat && distance(obstacle, state.boat) < 72) {
    obstacle.x = W - obstacle.x;
    obstacle.y = H - obstacle.y;
  }

  return obstacle;
}

function createHelicopter() {
  const fromLeft = Math.random() < 0.5;
  return {
    x: fromLeft ? -28 : W + 28,
    y: 30 + Math.random() * 44,
    vx: fromLeft ? 58 : -58,
    dropped: false,
    dropX: 72 + Math.random() * (W - 144),
    blade: 0,
    radius: 12
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
  state.obstacleTimer -= dt;
  state.helicopterTimer -= dt;
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.propFoulTimer = Math.max(0, state.propFoulTimer - dt);
  state.bossAnnounce = Math.max(0, state.bossAnnounce - dt);
  state.shake = Math.max(0, state.shake - dt * 20);

  updateBoat(dt);
  updateProjectiles(dt);
  updateMines(dt);
  updateOrcas(dt);
  updatePickups(dt);
  updateObstacles(dt);
  updateHelicopters(dt);
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
    pickupDelay: clamp(6.5 - level * 0.35, 3.5, 6.5),
    obstacleLimit: level < 3 ? 0 : clamp(1 + Math.floor((level - 3) * 0.85), 1, 6),
    obstacleDelay: level < 3 ? 12 : clamp(11 - level * 1.1, 2.4, 8),
    helicopterDelay: clamp(44 - level * 2.5, 24, 44)
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

function dropMine() {
  if (state.mode !== "playing" || state.shots <= 0) {
    return;
  }

  state.shots -= 1;
  state.mines.push({
    x: state.boat.x,
    y: state.boat.y,
    radius: 9,
    life: 5,
    bob: Math.random() * Math.PI * 2,
    spin: Math.random() * Math.PI
  });
  addWake(state.boat.x, state.boat.y, "rgba(255, 211, 107, 0.7)", 0.5, 8);
  updateHud();
}

function updateMines(dt) {
  state.mines = state.mines.filter((mine) => {
    mine.life -= dt;
    mine.bob += dt * 2;
    mine.spin += dt * 1.5;

    for (const orca of state.orcas) {
      if (distance(mine, orca) < mine.radius + orca.radius) {
        repelOrca(orca, mine);
        state.score += 150;
        state.shake = 4;
        addWake(mine.x, mine.y, "rgba(255, 150, 60, 0.95)", 0.9, 18);
        playSound("hit");
        return false;
      }
    }

    return mine.life > 0;
  });
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
  orca.warned = false;
  orca.damaged = true;

  if (orca.isBoss && orca.health > 1) {
    orca.health -= 1;
    orca.hitFlash = 0.3;
    orca.state = "recover";
    orca.timer = 0.9;
    orca.vx = Math.cos(angle) * 55;
    orca.vy = Math.sin(angle) * 55;
    addWake(orca.x, orca.y, "rgba(255, 255, 255, 0.95)", 0.6, 16);
    return;
  }

  if (orca.isBoss) orca.health = 0;
  orca.state = "recover";
  orca.timer = 1.2;
  orca.vx = Math.cos(angle) * 95;
  orca.vy = Math.sin(angle) * 95;
  addWake(orca.x, orca.y, "rgba(255, 211, 107, 0.95)", 0.8, 13);
}

function updateBoat(dt) {
  const boat = state.boat;
  boat.shieldTimer = Math.max(0, boat.shieldTimer - dt);
  let ax = 0;
  let ay = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) ax -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) ax += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) ay -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) ay += 1;
  ax += touchInput.x;
  ay += touchInput.y;

  const moving = Math.hypot(ax, ay) > 0.05;
  const propFouled = state.propFoulTimer > 0;
  let boostActive = false;
  if ((keys.has("Space") || touchInput.boost) && boat.boost > 0 && moving && !propFouled) {
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

  const accel = propFouled ? 0 : boostActive ? 170 : 108;
  boat.vx += ax * accel * dt;
  boat.vy += ay * accel * dt;
  const drag = propFouled ? 0.015 : 0.08;
  boat.vx *= Math.pow(drag, dt);
  boat.vy *= Math.pow(drag, dt);
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

  if (difficulty.level >= 8 && !state.orcas.some((orca) => orca.isBoss)) {
    state.orcas.push(createOrca(false, true));
    state.bossAnnounce = 2;
  }

  for (const orca of state.orcas) {
    orca.timer -= dt;
    orca.hitFlash = Math.max(0, orca.hitFlash - dt);
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
        orca.timer = orca.isBoss ? Math.max(0.3, difficulty.warnTime - 0.4) : difficulty.warnTime;
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
        orca.chargeSpeed = orca.isBoss ? difficulty.chargeSpeed * 1.4 : difficulty.chargeSpeed;
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
        if (state.boat.shieldTimer > 0) {
          repelOrca(orca, state.boat);
          state.shake = 3;
          addWake(state.boat.x, state.boat.y, "rgba(120, 245, 255, 0.95)", 0.5, 12);
        } else {
          orca.damaged = true;
          state.boat.health = Math.max(0, state.boat.health - 28);
          state.shake = 4;
          playSound("hit");
          addWake(state.boat.x, state.boat.y, "rgba(255, 211, 107, 0.95)", 0.45, 9);
          if (state.boat.health <= 0) {
            endGame();
          }
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
        if (orca.isBoss && orca.health > 0) {
          const respawned = createOrca(false, true);
          respawned.health = orca.health;
          Object.assign(orca, respawned);
        } else if (orca.isBoss) {
          orca.dead = true;
        } else {
          Object.assign(orca, createOrca());
        }
      }
    }
  }

  state.orcas = state.orcas.filter((orca) => !orca.dead);
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
      } else if (pickup.type === "medkit") {
        state.boat.health = Math.min(100, state.boat.health + 15);
        state.score += 50;
      } else if (pickup.type === "gem") {
        state.gems += 1;
        state.score += 35;
        if (state.gems >= GEMS_FOR_SHOT) {
          state.gems -= GEMS_FOR_SHOT;
          state.shots += 1;
          addWake(state.boat.x, state.boat.y, "rgba(200, 255, 241, 0.95)", 0.9, 14);
        }
      } else if (pickup.type === "shield") {
        state.boat.shieldTimer = 3.5;
        addWake(state.boat.x, state.boat.y, "rgba(120, 245, 255, 0.95)", 0.9, 16);
      } else if (pickup.type === "score") {
        state.score += 120;
      }
      playSound("pickup");
      addWake(pickup.x, pickup.y, "rgba(255, 211, 107, 0.9)", 0.7, 10);
      return false;
    }
    return true;
  });
}

function updateObstacles(dt) {
  const difficulty = getDifficulty();
  if (state.obstacles.length < difficulty.obstacleLimit && state.obstacleTimer <= 0) {
    state.obstacles.push(createObstacle());
    state.obstacleTimer = difficulty.obstacleDelay + Math.random() * 3;
  }

  for (const obstacle of state.obstacles) {
    obstacle.bob += dt * 2.5;
    obstacle.life -= dt;
  }

  state.obstacles = state.obstacles.filter((obstacle) => {
    if (distance(obstacle, state.boat) < obstacle.radius + state.boat.radius) {
      foulProp(obstacle);
      return false;
    }
    return obstacle.life > 0;
  });
}

function updateHelicopters(dt) {
  const difficulty = getDifficulty();
  if (difficulty.level >= 2 && state.helicopterTimer <= 0 && state.helicopters.length === 0) {
    state.helicopters.push(createHelicopter());
    state.helicopterTimer = difficulty.helicopterDelay + Math.random() * 18;
  }

  state.helicopters = state.helicopters.filter((helicopter) => {
    helicopter.x += helicopter.vx * dt;
    helicopter.blade += dt * 18;

    const passedDrop = helicopter.vx > 0 ? helicopter.x >= helicopter.dropX : helicopter.x <= helicopter.dropX;
    if (!helicopter.dropped && passedDrop) {
      helicopter.dropped = true;
      const dropType = Math.random() < 0.15 ? "shield" : "medkit";
      state.pickups.push(createPickup(dropType, helicopter.x, helicopter.y + 16));
      addWake(helicopter.x, helicopter.y + 16, "rgba(255, 211, 107, 0.76)", 0.55, 8);
    }

    return helicopter.x > -44 && helicopter.x < W + 44;
  });
}

function foulProp(obstacle) {
  state.propFoulTimer = 2;
  state.shake = Math.max(state.shake, 2.5);
  state.score = Math.max(0, state.score - 15);
  state.boat.vx *= 0.25;
  state.boat.vy *= 0.25;
  addWake(obstacle.x, obstacle.y, "rgba(63, 220, 85, 0.82)", 0.95, 14);
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
  propEl.textContent = state.propFoulTimer > 0 ? "Fouled" : "OK";
  healthBar.style.width = `${state.boat ? state.boat.health : 100}%`;
  const shieldActive = state.boat && state.boat.shieldTimer > 0;
  shieldHud.hidden = !shieldActive;
  if (shieldActive) shieldTimeEl.textContent = state.boat.shieldTimer.toFixed(1);
  touchControls.classList.toggle("is-visible", state.mode === "playing");
  fireTouch.classList.toggle("is-ready", state.mode === "playing" && state.shots > 0);
  mineTouch.classList.toggle("is-ready", state.mode === "playing" && state.shots > 0);
}

function draw() {
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(Math.round(shakeX), Math.round(shakeY));
  drawOcean();
  drawWakes();
  if (state.mode === "playing") {
    for (const helicopter of state.helicopters) drawHelicopter(helicopter);
    for (const obstacle of state.obstacles) drawObstacle(obstacle);
    for (const mine of state.mines) drawMine(mine);
    for (const pickup of state.pickups) drawPickup(pickup);
    for (const orca of state.orcas) drawOrca(orca);
    for (const shot of state.projectiles) drawProjectile(shot);
    drawBoat(state.boat);
    drawBoostMeter(state.boat);
    drawPropWarning();
    drawAnnouncements();
  } else {
    drawAttractScene();
  }
  ctx.restore();
}

function drawObstacle(obstacle) {
  const y = Math.round(obstacle.y + Math.sin(obstacle.bob) * 1.5);
  if (obstacle.type === "seaweed") {
    ctx.fillStyle = "#1f8f4d";
    pixelRect(obstacle.x - 9, y + 3, 18, 4);
    ctx.fillStyle = "#3fdc55";
    pixelRect(obstacle.x - 8, y - 5, 3, 10);
    pixelRect(obstacle.x - 2, y - 8, 3, 13);
    pixelRect(obstacle.x + 5, y - 4, 3, 9);
    ctx.fillStyle = "#0f5b79";
    pixelRect(obstacle.x - 6, y - 1, 3, 3);
    pixelRect(obstacle.x + 1, y + 1, 3, 3);
    return;
  }

  ctx.fillStyle = "#d85b2c";
  pixelRect(obstacle.x - 7, y - 5, 14, 10);
  ctx.fillStyle = "#ffd36b";
  pixelRect(obstacle.x - 4, y - 8, 8, 3);
  ctx.fillStyle = "#071823";
  pixelRect(obstacle.x - 4, y - 2, 8, 2);
  ctx.strokeStyle = "rgba(7, 24, 35, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(obstacle.x + 7), y);
  ctx.lineTo(Math.round(obstacle.x + 14), y + 8);
  ctx.stroke();
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
  if (boat && boat.shieldTimer > 0) {
    const pulse = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(state.time * 12));
    ctx.save();
    ctx.strokeStyle = `rgba(120, 245, 255, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Math.round(boat.x), Math.round(boat.y), 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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
  if (orca.isBoss) ctx.scale(1.6, 1.6);

  const flash = orca.state === "warn" && Math.floor(orca.timer * 8) % 2 === 0;
  const hit = orca.hitFlash > 0;
  const base = orca.isBoss ? "#1a1a3a" : "#071823";
  ctx.fillStyle = hit ? "#ffffff" : flash ? "#f06c3d" : base;
  pixelRect(-11, -5, 20, 10);
  pixelRect(-3, -9, 7, 4);
  pixelRect(6, -3, 8, 6);
  ctx.fillStyle = hit ? "#ffffff" : "#e8f2e5";
  pixelRect(-7, 1, 8, 4);
  ctx.fillStyle = hit ? "#ffffff" : "#071823";
  pixelRect(-14, -2, 4, 4);
  ctx.restore();

  if (orca.isBoss && orca.state !== "charge") {
    const cx = Math.round(orca.x);
    const cy = Math.round(orca.y - orca.radius - 8);
    ctx.fillStyle = "#ffd36b";
    pixelRect(cx - 8, cy + 6, 18, 3);
    pixelRect(cx - 8, cy + 1, 3, 6);
    pixelRect(cx, cy - 2, 3, 9);
    pixelRect(cx + 7, cy + 1, 3, 6);
  }
}

function drawHelicopter(helicopter) {
  ctx.save();
  ctx.translate(Math.round(helicopter.x), Math.round(helicopter.y));
  ctx.scale(helicopter.vx > 0 ? -0.75 : 0.75, 0.75);

  const bladeLight = Math.floor(helicopter.blade) % 2 === 0;

  ctx.fillStyle = bladeLight ? "rgba(200, 255, 241, 0.72)" : "rgba(156, 199, 204, 0.72)";
  pixelRect(-24, -22, 48, 4);
  pixelRect(-16, -26, 32, 4);
  ctx.fillStyle = "#071823";
  pixelRect(-2, -17, 4, 8);

  ctx.fillStyle = "#071823";
  pixelRect(-19, -7, 34, 16);
  pixelRect(14, -3, 23, 6);
  pixelRect(33, -8, 10, 16);

  ctx.fillStyle = "#f0322d";
  pixelRect(-17, -6, 30, 14);
  pixelRect(-12, -10, 17, 4);
  pixelRect(13, -1, 22, 4);
  pixelRect(36, -6, 6, 12);

  ctx.fillStyle = "#b91424";
  pixelRect(-7, -3, 11, 10);
  pixelRect(5, 2, 11, 5);

  ctx.fillStyle = "#9fd3f2";
  pixelRect(-15, -13, 12, 8);
  pixelRect(-2, -14, 13, 7);
  pixelRect(38, -3, 4, 7);
  ctx.fillStyle = "#d8f5ff";
  pixelRect(-12, -12, 4, 5);
  pixelRect(4, -13, 4, 5);
  pixelRect(39, -1, 3, 5);

  ctx.fillStyle = "#fff8df";
  pixelRect(-20, -2, 5, 5);
  ctx.fillStyle = "#071823";
  pixelRect(-13, 10, 3, 9);
  pixelRect(3, 10, 3, 9);
  pixelRect(-18, 18, 30, 3);

  ctx.fillStyle = bladeLight ? "#c8fff1" : "#9cc7cc";
  pixelRect(31, -12, 14, 3);
  pixelRect(37, -18, 3, 14);
  ctx.fillStyle = "#f06c3d";
  pixelRect(-1, 9, 3, 6);
  ctx.restore();
}

function drawPickup(pickup) {
  const y = Math.round(pickup.y + Math.sin(pickup.bob) * 2);
  if (pickup.type === "medkit") {
    ctx.fillStyle = "#fff8df";
    pixelRect(pickup.x - 6, y - 6, 12, 12);
    ctx.fillStyle = "#f06c3d";
    pixelRect(pickup.x - 2, y - 5, 4, 10);
    pixelRect(pickup.x - 5, y - 2, 10, 4);
    ctx.fillStyle = "#071823";
    pixelRect(pickup.x - 6, y + 5, 12, 2);
    return;
  }

  if (pickup.type === "gem") {
    ctx.fillStyle = "#c8fff1";
    pixelRect(pickup.x - 3, y - 6, 6, 3);
    pixelRect(pickup.x - 5, y - 3, 10, 6);
    pixelRect(pickup.x - 3, y + 3, 6, 3);
    ctx.fillStyle = "#2fb7cc";
    pixelRect(pickup.x - 2, y - 2, 4, 4);
    return;
  }

  if (pickup.type === "shield") {
    ctx.fillStyle = "#c8fff1";
    pixelRect(pickup.x - 2, y - 7, 4, 2);
    pixelRect(pickup.x - 4, y - 5, 8, 2);
    pixelRect(pickup.x - 6, y - 3, 12, 6);
    pixelRect(pickup.x - 4, y + 3, 8, 2);
    pixelRect(pickup.x - 2, y + 5, 4, 2);
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

function drawMine(mine) {
  const y = Math.round(mine.y + Math.sin(mine.bob) * 1.5);
  ctx.save();
  ctx.translate(Math.round(mine.x), y);
  ctx.rotate(mine.spin);
  ctx.fillStyle = "#ffd36b";
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    pixelRect(-1, -11, 2, 22);
  }
  ctx.restore();

  ctx.fillStyle = "#071823";
  pixelRect(mine.x - 6, y - 6, 12, 12);
  const blink = Math.floor(mine.life * 6) % 2 === 0;
  ctx.fillStyle = blink ? "#f06c3d" : "#ffd36b";
  pixelRect(mine.x - 2, y - 2, 4, 4);
}

function drawAnnouncements() {
  if (state.bossAnnounce <= 0) {
    return;
  }

  const blink = Math.floor(state.bossAnnounce * 6) % 2 === 0;
  ctx.fillStyle = "#1a1a3a";
  pixelRect(W / 2 - 44, 24, 88, 16);
  ctx.fillStyle = blink ? "#ffd36b" : "#f06c3d";
  pixelRect(W / 2 - 44, 24, 88, 2);
  pixelRect(W / 2 - 44, 38, 88, 2);
  ctx.fillStyle = blink ? "#ffd36b" : "#fff8df";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("KING ORCA", W / 2, 33);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawBoostMeter(boat) {
  const x = 10;
  const y = H - 12;
  ctx.fillStyle = "#071823";
  pixelRect(x, y, 46, 5);
  ctx.fillStyle = state.propFoulTimer > 0 ? "#f06c3d" : "#c8fff1";
  pixelRect(x + 1, y + 1, Math.round(44 * (boat.boost / 100)), 3);
}

function drawPropWarning() {
  if (state.propFoulTimer <= 0) {
    return;
  }

  const blink = Math.floor(state.propFoulTimer * 8) % 2 === 0;
  ctx.fillStyle = blink ? "#f06c3d" : "#ffd36b";
  pixelRect(W / 2 - 31, H - 23, 62, 9);
  ctx.fillStyle = "#071823";
  pixelRect(W / 2 - 28, H - 21, 56, 5);
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
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyF", "KeyG"].includes(event.code)) {
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
  if (event.code === "KeyG") {
    dropMine();
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

mineTouch.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  mineTouch.classList.add("is-active");
  dropMine();
});

mineTouch.addEventListener("pointerup", () => {
  mineTouch.classList.remove("is-active");
});
mineTouch.addEventListener("pointercancel", () => {
  mineTouch.classList.remove("is-active");
});

updateHud();
requestAnimationFrame(loop);
