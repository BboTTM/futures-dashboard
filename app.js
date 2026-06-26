const state = {
  raw: null,
  filteredDaily: [],
  filteredUsers: [],
  responseMeta: null,
  chart: null,
  trendMode: "volume",
  rankMetric: "合约交易量",
};

const API_ENDPOINT = "";
const EMPTY_DATA = {
  meta: { summaryRows: 0, dailyRows: 0 },
  kpis: { "日期范围": ["", ""] },
  users: [],
  daily: [],
};

const fields = {
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  agentId: document.querySelector("#agentId"),
  userId: document.querySelector("#userId"),
  country: document.querySelector("#country"),
  kyc: document.querySelector("#kyc"),
  level1: document.querySelector("#level1"),
  level2: document.querySelector("#level2"),
};

const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateInput(yyyymmdd) {
  const value = String(yyyymmdd || "");
  if (value.length !== 8) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function toCompactDate(dateValue) {
  if (!dateValue) return "";
  return String(dateValue).replaceAll("-", "");
}

function displayDate(value) {
  return String(value || "--").replaceAll("-", "");
}

function compactDateLabel(yyyymmdd) {
  const value = String(yyyymmdd || "");
  return value.length === 8 ? `${value.slice(4, 6)}/${value.slice(6, 8)}` : value;
}

function money(value) {
  return fmt.format(num(value));
}

function integer(value) {
  return fmt0.format(num(value));
}

function shortMoney(value) {
  const n = Math.abs(num(value));
  const sign = num(value) < 0 ? "-" : "";
  if (n >= 100000000) return `${sign}${fmt.format(n / 100000000)}亿`;
  if (n >= 10000) return `${sign}${fmt.format(n / 10000)}万`;
  return `${sign}${fmt.format(n)}`;
}

function includesId(source, query) {
  if (!query) return true;
  if (source === null || source === undefined || source === "") return false;
  return String(source).includes(String(query).trim());
}

function parseUidList(value) {
  return [...new Set(String(value || "")
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function matchesUserId(source, filters) {
  if (!filters.userId) return true;
  const sourceId = String(source || "");
  if (filters.userIds.length > 1) return filters.userIds.includes(sourceId);
  return sourceId.includes(filters.userId);
}

function matchesAgentId(source, filters) {
  if (!filters.agentId) return true;
  const sourceId = String(source || "");
  if (filters.agentIds.length > 1) return filters.agentIds.includes(sourceId);
  return sourceId.includes(filters.agentId);
}

function currentFilters() {
  const agentId = fields.agentId.value.trim();
  const userId = fields.userId.value.trim();
  return {
    startDate: toCompactDate(fields.startDate.value),
    endDate: toCompactDate(fields.endDate.value),
    agentId,
    agentIds: parseUidList(agentId),
    userId,
    userIds: parseUidList(userId),
    country: fields.country.value,
    kyc: fields.kyc.value,
    level1: fields.level1.value.trim(),
    level2: fields.level2.value.trim(),
  };
}

function userMatches(user, filters) {
  return (
    matchesAgentId(user["代理id"], filters) &&
    matchesUserId(user["用户id"], filters) &&
    includesId(user["一级合伙人id"], filters.level1) &&
    includesId(user["二级合伙人id"], filters.level2) &&
    (!filters.country || user["国家名称"] === filters.country) &&
    (!filters.kyc || user["是否kyc"] === filters.kyc)
  );
}

function dailyMatches(row, filters, allowedUsers) {
  const day = String(row["统计日期"]);
  return (
    (!filters.startDate || day >= filters.startDate) &&
    (!filters.endDate || day <= filters.endDate) &&
    allowedUsers.has(String(row["用户id"]))
  );
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + num(row[field]), 0);
}

function uniqueCount(rows, field) {
  return new Set(rows.map((row) => String(row[field])).filter(Boolean)).size;
}

function groupBy(rows, field) {
  return rows.reduce((map, row) => {
    const key = row[field] === null || row[field] === undefined || row[field] === "" ? "未填写" : String(row[field]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());
}

function normalizeCountryOptions(options) {
  return [...new Set((options || [])
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.["国家名称"] || item?.name || item?.country || item?.label || "";
    })
    .filter(Boolean))]
    .sort();
}

function updateCountryOptions(countries) {
  const current = fields.country.value;
  const normalized = normalizeCountryOptions(countries);
  const options = current && !normalized.includes(current) ? [current, ...normalized] : normalized;
  fields.country.innerHTML = `<option value="">全部</option>${options.map((name) => `<option value="${name}">${name}</option>`).join("")}`;
  fields.country.value = current && options.includes(current) ? current : "";
}

function aggregateUsers(users, dailyRows) {
  const dailyByUser = groupBy(dailyRows, "用户id");
  return users.map((user) => {
    const rows = dailyByUser.get(String(user["用户id"])) || [];
    const tradeDays = rows.filter((row) => num(row["合约交易量"]) > 0).length;
    return {
      ...user,
      "充值金额": sum(rows, "充值金额"),
      "提现金额": sum(rows, "提现金额"),
      "合约交易量": sum(rows, "合约交易量"),
      "合约手续费": sum(rows, "合约手续费"),
      "合约净手续费": sum(rows, "合约净手续费"),
      "每日新开仓交易额": sum(rows, "每日新开仓交易额"),
      "当日划转至合约账户总额": sum(rows, "当日划转至合约账户总额"),
      "当日划转出合约账户总额": sum(rows, "当日划转出合约账户总额"),
      "净入金": sum(rows, "充值金额") - sum(rows, "提现金额"),
      "净划转": sum(rows, "当日划转至合约账户总额") + sum(rows, "当日划转出合约账户总额"),
      "活跃天数": uniqueCount(rows, "统计日期"),
      "交易天数": tradeDays,
      "平均持仓时间": rows.length ? rows.reduce((total, row) => total + num(row["平均持仓时间"]), 0) / rows.length : num(user["平均持仓时间"]),
    };
  });
}

function buildMockDashboard(filters) {
  const matchingUsers = state.raw.users.filter((user) => userMatches(user, filters));
  const allowedUsers = new Set(matchingUsers.map((user) => String(user["用户id"])));
  const daily = state.raw.daily.filter((row) => dailyMatches(row, filters, allowedUsers));
  const users = aggregateUsers(matchingUsers, daily).filter((user) => num(user["活跃天数"]) > 0 || !filters.startDate);
  return {
    daily,
    users,
    countries: normalizeCountryOptions(state.raw.users.map((user) => user["国家名称"])),
    meta: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      userCount: users.length,
      dailyRowCount: daily.length,
    },
  };
}

function normalizeDashboardResponse(data, filters) {
  const daily = data.daily || data.dailyTrend || [];
  const users = data.users || [];
  return {
    daily,
    users,
    countries: normalizeCountryOptions(data.filterOptions?.countries || data.countryOptions || data.countries || users || []),
    meta: data.meta || {
      startDate: filters.startDate,
      endDate: filters.endDate,
      userCount: data.summary?.userCount,
      dailyRowCount: data.summary?.dailyRowCount,
    },
  };
}

async function fetchDashboardOnce(filters, userId = filters.userId, agentId = filters.agentId) {
  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate,
    agentId,
    userId,
    country: filters.country,
    kyc: filters.kyc,
    level1PartnerUid: filters.level1,
    level2PartnerUid: filters.level2,
  });
  const response = await fetch(`${API_ENDPOINT}?${params.toString()}`);
  if (!response.ok) throw new Error(`接口请求失败：${response.status}`);
  const data = await response.json();
  return normalizeDashboardResponse(data, filters);
}

function mergeDashboards(dashboards, filters) {
  const daily = dashboards.flatMap((dashboard) => dashboard.daily || []);
  const userMap = new Map();
  dashboards.flatMap((dashboard) => dashboard.users || []).forEach((user) => {
    userMap.set(String(user["用户id"] || user.userId || user.uid), user);
  });
  const users = [...userMap.values()];
  const countries = normalizeCountryOptions(dashboards.flatMap((dashboard) => dashboard.countries || dashboard.users || []));
  return {
    daily,
    users,
    countries,
    meta: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      userCount: users.length,
      dailyRowCount: daily.length,
    },
  };
}

async function fetchDashboard(filters) {
  if (!API_ENDPOINT) return buildMockDashboard(filters);
  const userIds = filters.userIds.length ? filters.userIds : [filters.userId];
  const agentIds = filters.agentIds.length ? filters.agentIds : [filters.agentId];
  const requests = agentIds.flatMap((agentId) => userIds.map((userId) => ({ agentId, userId })));
  if (requests.length <= 1) return fetchDashboardOnce(filters, requests[0].userId, requests[0].agentId);

  const dashboards = await Promise.all(requests.map((request) => fetchDashboardOnce(filters, request.userId, request.agentId)));
  return mergeDashboards(dashboards, filters);
}

async function applyFilters() {
  const filters = currentFilters();
  const dashboard = await fetchDashboard(filters);
  state.filteredDaily = dashboard.daily;
  state.filteredUsers = dashboard.users;
  state.responseMeta = dashboard.meta;
  updateCountryOptions(dashboard.countries?.length ? dashboard.countries : dashboard.users);
  renderMeta();
  renderAll();
}

function buildTrend(rows) {
  const byDate = groupBy(rows, "统计日期");
  return [...byDate.entries()]
    .map(([date, items]) => ({
      date,
      "充值金额": sum(items, "充值金额"),
      "提现金额": sum(items, "提现金额"),
      "合约交易量": sum(items, "合约交易量"),
      "合约手续费": sum(items, "合约手续费"),
      "合约净手续费": sum(items, "合约净手续费"),
      "每日新开仓交易额": sum(items, "每日新开仓交易额"),
      "当日划转至合约账户总额": sum(items, "当日划转至合约账户总额"),
      "当日划转出合约账户总额": sum(items, "当日划转出合约账户总额"),
      "净划转": sum(items, "当日划转至合约账户总额") + sum(items, "当日划转出合约账户总额"),
      "活跃用户数": uniqueCount(items, "用户id"),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function renderMeta() {
  const filters = currentFilters();
  const meta = state.responseMeta || {};
  const startDate = meta.startDate || meta.dateRange?.[0] || filters.startDate || state.raw.kpis["日期范围"][0];
  const endDate = meta.endDate || meta.dateRange?.[1] || filters.endDate || state.raw.kpis["日期范围"][1];
  const userCount = meta.userCount ?? meta.summaryRows ?? state.filteredUsers.length;
  const dailyRowCount = meta.dailyRowCount ?? meta.dailyRows ?? state.filteredDaily.length;
  document.querySelector("#dataRange").textContent = `${displayDate(startDate)} 至 ${displayDate(endDate)}`;
  document.querySelector("#sourceRows").textContent = `${integer(userCount)} 用户 / ${integer(dailyRowCount)} 日明细`;
}

function renderKpis() {
  const rows = state.filteredDaily;
  const users = state.filteredUsers;
  const kpis = [
    ["用户数", users.length, "筛选后的用户数量", integer],
    ["总充值", sum(rows, "充值金额"), "来自日明细口径", shortMoney],
    ["总提现", sum(rows, "提现金额"), "来自日明细口径", shortMoney],
    ["净入金", sum(rows, "充值金额") - sum(rows, "提现金额"), "充值 - 提现", shortMoney],
    ["合约划转", sum(rows, "当日划转至合约账户总额"), "划转至合约账户", shortMoney],
    ["合约划出", sum(rows, "当日划转出合约账户总额"), "划出合约账户", shortMoney],
    ["净划转", sum(rows, "当日划转至合约账户总额") + sum(rows, "当日划转出合约账户总额"), "划转 - 划出", shortMoney],
    ["合约交易量", sum(rows, "合约交易量"), "筛选期内交易规模", shortMoney],
    ["合约手续费", sum(rows, "合约手续费"), "筛选期内手续费", shortMoney],
    ["合约净手续费", sum(rows, "合约净手续费"), "筛选期内净手续费", shortMoney],
  ];

  document.querySelector("#kpiGrid").innerHTML = kpis
    .map(([label, value, sub, formatter]) => `
      <article class="kpi-card">
        <div class="label">${label}</div>
        <div class="value">${formatter(value)}</div>
        <div class="sub">${sub}</div>
      </article>
    `)
    .join("");
}

function drawLineChart(canvas, trend, series) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 42, right: 32, bottom: 54, left: 96 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const allValues = series.flatMap((item) => trend.map((row) => num(row[item.field])));
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 1);
  const valueRange = Math.max(maxValue - minValue, 1);
  const xStep = trend.length > 1 ? chartW / (trend.length - 1) : chartW;
  const yForValue = (value) => pad.top + chartH - ((value - minValue) / valueRange) * chartH;
  const points = [];

  ctx.strokeStyle = "#dfe4ea";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, Arial";
  ctx.fillStyle = "#677185";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const label = shortMoney(maxValue - valueRange * (i / 4));
    ctx.fillText(label, pad.left - 14, y);
  }

  if (minValue < 0 && maxValue > 0) {
    const zeroY = yForValue(0);
    ctx.strokeStyle = "#aeb8c6";
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(width - pad.right, zeroY);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  trend.forEach((row, index) => {
    if (index % Math.ceil(trend.length / 8) !== 0 && index !== trend.length - 1) return;
    const x = pad.left + xStep * index;
    ctx.fillText(compactDateLabel(row.date), x, height - pad.bottom + 14);
  });

  series.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trend.forEach((row, index) => {
      const x = pad.left + xStep * index;
      const y = yForValue(num(row[item.field]));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    trend.forEach((row, index) => {
      const x = pad.left + xStep * index;
      const y = yForValue(num(row[item.field]));
      points.push({ x, y, index, field: item.field, label: item.label, color: item.color, value: num(row[item.field]) });
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  let legendX = pad.left;
  series.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, 7, 12, 12);
    ctx.fillStyle = "#172033";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, legendX + 18, 13);
    legendX += item.label.length * 13 + 58;
  });

  state.chart = { trend, series, points, pad, width, height };
}

function renderTrend() {
  const trend = buildTrend(state.filteredDaily);
  const modes = {
    volume: [
      { field: "合约交易量", label: "合约交易量", color: "#2f6fed" },
      { field: "每日新开仓交易额", label: "新开仓交易额", color: "#0f9f6e" },
    ],
    cash: [
      { field: "充值金额", label: "充值", color: "#2f6fed" },
      { field: "提现金额", label: "提现", color: "#d84b4b" },
    ],
    fee: [
      { field: "合约手续费", label: "手续费", color: "#bd7a19" },
      { field: "合约净手续费", label: "净手续费", color: "#0f9f6e" },
    ],
    transfer: [
      { field: "当日划转至合约账户总额", label: "合约划转", color: "#2f6fed" },
      { field: "当日划转出合约账户总额", label: "合约划出", color: "#d84b4b" },
      { field: "净划转", label: "净划转", color: "#0f9f6e" },
    ],
  };

  drawLineChart(document.querySelector("#trendChart"), trend, modes[state.trendMode]);
}

function showTrendTooltip(event) {
  const chart = state.chart;
  const tooltip = document.querySelector("#trendTooltip");
  const canvas = document.querySelector("#trendChart");
  if (!chart || !tooltip || !canvas || !chart.points.length) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const nearest = chart.points.reduce((best, point) => {
    const distance = Math.hypot(point.x - mouseX, point.y - mouseY);
    return !best || distance < best.distance ? { point, distance } : best;
  }, null);

  if (!nearest || nearest.distance > 22) {
    tooltip.hidden = true;
    return;
  }

  const row = chart.trend[nearest.point.index];
  const rows = chart.series
    .map((item) => `
      <div class="tip-row">
        <span class="tip-name"><span class="tip-dot" style="background:${item.color}"></span>${item.label}</span>
        <b>${money(row[item.field])}</b>
      </div>
    `)
    .join("");
  tooltip.innerHTML = `<strong>${displayDate(row.date)}</strong>${rows}`;
  tooltip.hidden = false;

  const tooltipWidth = tooltip.offsetWidth || 180;
  const tooltipHeight = tooltip.offsetHeight || 90;
  const left = Math.min(Math.max(8, nearest.point.x + 14), rect.width - tooltipWidth - 8);
  const top = Math.min(Math.max(8, nearest.point.y - tooltipHeight - 12), rect.height - tooltipHeight - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTrendTooltip() {
  const tooltip = document.querySelector("#trendTooltip");
  if (tooltip) tooltip.hidden = true;
}

function renderCountryList() {
  const byCountry = [...groupBy(state.filteredUsers, "国家名称").entries()].map(([name, users]) => ({
    name,
    users: users.length,
    volume: sum(users, "合约交易量"),
  }));
  const max = Math.max(...byCountry.map((row) => row.volume), 1);
  document.querySelector("#countryList").innerHTML = byCountry.length
    ? byCountry
        .sort((a, b) => b.volume - a.volume)
        .map((row) => `
          <div class="country-row">
            <div class="row-top"><span>${row.name}</span><span>${row.users} 人 · ${shortMoney(row.volume)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (row.volume / max) * 100)}%"></div></div>
          </div>
        `)
        .join("")
    : `<div class="empty">暂无数据</div>`;
}

function renderRanks() {
  const metric = state.rankMetric;
  const top = [...state.filteredUsers].sort((a, b) => num(b[metric]) - num(a[metric])).slice(0, 8);
  const max = Math.max(...top.map((row) => num(row[metric])), 1);
  document.querySelector("#rankList").innerHTML = top.length
    ? top
        .map((user, index) => `
          <div class="rank-row">
            <div class="row-top">
              <span>${index + 1}. ${user["用户id"]}</span>
              <span>${shortMoney(user[metric])}</span>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (num(user[metric]) / max) * 100)}%"></div></div>
          </div>
        `)
        .join("")
    : `<div class="empty">暂无数据</div>`;
}

function renderTable() {
  const rows = [...state.filteredUsers].sort((a, b) => num(b["合约交易量"]) - num(a["合约交易量"]));
  document.querySelector("#tableCount").textContent = `${rows.length} 个用户`;
  document.querySelector("#userTable").innerHTML = rows.length
    ? rows
        .map((user) => `
          <tr data-user="${user["用户id"]}">
            <td><strong>${user["用户id"]}</strong></td>
            <td>${user["上级邀请人"] || "--"}</td>
            <td>${user["国家名称"] || "--"}</td>
            <td>${user["首次充值时间"] || "--"}</td>
            <td>${user["首次合约交易时间"] || "--"}</td>
            <td>${money(user["充值金额"])}</td>
            <td>${money(user["提现金额"])}</td>
            <td>${money(user["净入金"])}</td>
            <td>${money(user["当日划转至合约账户总额"])}</td>
            <td>${money(user["当日划转出合约账户总额"])}</td>
            <td>${money(user["净划转"])}</td>
            <td>${shortMoney(user["合约交易量"])}</td>
            <td>${money(user["合约手续费"])}</td>
            <td>${money(user["合约净手续费"])}</td>
            <td>${fmt0.format(num(user["活跃天数"]))}</td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="15"><div class="empty">暂无匹配用户</div></td></tr>`;
}

function renderAll() {
  renderKpis();
  renderTrend();
  renderCountryList();
  renderRanks();
  renderTable();
}

function openDrawer(userId) {
  const user = state.filteredUsers.find((item) => String(item["用户id"]) === String(userId));
  if (!user) return;
  const rows = state.filteredDaily.filter((row) => String(row["用户id"]) === String(userId)).sort((a, b) => String(a["统计日期"]).localeCompare(String(b["统计日期"])));
  document.querySelector("#drawerTitle").textContent = String(userId);
  document.querySelector("#drawerBody").innerHTML = `
    <div class="detail-grid">
      ${detail("注册时间", user["注册时间"])}
      ${detail("国家", user["国家名称"])}
      ${detail("KYC", user["是否kyc"])}
      ${detail("首次充值时间", user["首次充值时间"])}
      ${detail("首次合约交易时间", user["首次合约交易时间"])}
      ${detail("上级邀请人", user["上级邀请人"])}
      ${detail("充值", money(user["充值金额"]))}
      ${detail("提现", money(user["提现金额"]))}
      ${detail("合约划转", money(user["当日划转至合约账户总额"]))}
      ${detail("合约划出", money(user["当日划转出合约账户总额"]))}
      ${detail("净划转", money(user["净划转"]))}
      ${detail("合约交易量", shortMoney(user["合约交易量"]))}
      ${detail("合约手续费", money(user["合约手续费"]))}
      ${detail("合约净手续费", money(user["合约净手续费"]))}
    </div>
    <div class="panel">
      <div class="panel-head compact"><h2>每日行为</h2></div>
      <div class="mini-table">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>用户 ID</th>
              <th>上级邀请人</th>
              <th>国家</th>
              <th>首充时间</th>
              <th>首交时间</th>
              <th>充值</th>
              <th>提现</th>
              <th>净入金</th>
              <th>合约划转</th>
              <th>合约划出</th>
              <th>净划转</th>
              <th>交易量</th>
              <th>手续费</th>
              <th>净手续费</th>
              <th>活跃天数</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${row["统计日期"]}</td>
                <td>${row["用户id"] || user["用户id"] || "--"}</td>
                <td>${row["上级邀请人"] || user["上级邀请人"] || "--"}</td>
                <td>${row["国家名称"] || user["国家名称"] || "--"}</td>
                <td>${row["首次充值时间"] || user["首次充值时间"] || "--"}</td>
                <td>${row["首次合约交易时间"] || user["首次合约交易时间"] || "--"}</td>
                <td>${money(row["充值金额"])}</td>
                <td>${money(row["提现金额"])}</td>
                <td>${money(num(row["充值金额"]) - num(row["提现金额"]))}</td>
                <td>${money(row["当日划转至合约账户总额"])}</td>
                <td>${money(row["当日划转出合约账户总额"])}</td>
                <td>${money(num(row["当日划转至合约账户总额"]) + num(row["当日划转出合约账户总额"]))}</td>
                <td>${shortMoney(row["合约交易量"])}</td>
                <td>${money(row["合约手续费"])}</td>
                <td>${money(row["合约净手续费"])}</td>
                <td>1</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.querySelector("#drawerOverlay").hidden = false;
  document.querySelector("#userDrawer").classList.add("open");
  document.querySelector("#userDrawer").setAttribute("aria-hidden", "false");
}

function detail(label, value) {
  return `<div class="detail-item"><span>${label}</span><strong>${value || "--"}</strong></div>`;
}

function closeDrawer() {
  document.querySelector("#drawerOverlay").hidden = true;
  document.querySelector("#userDrawer").classList.remove("open");
  document.querySelector("#userDrawer").setAttribute("aria-hidden", "true");
}

function setupFilters() {
  const dates = state.raw.kpis["日期范围"];
  fields.startDate.value = toDateInput(dates[0]);
  fields.endDate.value = toDateInput(dates[1]);
  updateCountryOptions(state.raw.users);

  Object.values(fields).forEach((field) => {
    field.addEventListener("input", () => applyFilters());
    field.addEventListener("change", () => applyFilters());
  });

  document.querySelector("#resetFilters").addEventListener("click", () => {
    fields.startDate.value = toDateInput(dates[0]);
    fields.endDate.value = toDateInput(dates[1]);
    fields.agentId.value = "";
    fields.userId.value = "";
    fields.country.value = "";
    fields.kyc.value = "";
    fields.level1.value = "";
    fields.level2.value = "";
    applyFilters();
  });
}

function setupEvents() {
  document.querySelector("#trendMode").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.trendMode = button.dataset.mode;
    document.querySelectorAll("#trendMode button").forEach((item) => item.classList.toggle("active", item === button));
    hideTrendTooltip();
    renderTrend();
  });

  const trendCanvas = document.querySelector("#trendChart");
  trendCanvas.addEventListener("mousemove", showTrendTooltip);
  trendCanvas.addEventListener("mouseleave", hideTrendTooltip);

  document.querySelector("#rankMetric").addEventListener("change", (event) => {
    state.rankMetric = event.target.value;
    renderRanks();
  });

  document.querySelector("#userTable").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-user]");
    if (row) openDrawer(row.dataset.user);
  });

  document.querySelector("#closeDrawer").addEventListener("click", closeDrawer);
  document.querySelector("#drawerOverlay").addEventListener("click", closeDrawer);
  window.addEventListener("resize", () => renderTrend());
}

async function init() {
  if (window.CONTRACT_ACTIVITY_DATA) {
    state.raw = window.CONTRACT_ACTIVITY_DATA;
  } else if (!API_ENDPOINT) {
    state.raw = EMPTY_DATA;
  } else {
    const response = await fetch("./data/contract-activity.json");
    state.raw = await response.json();
  }
  renderMeta();
  setupFilters();
  setupEvents();
  applyFilters();
}

init().catch((error) => {
  document.body.innerHTML = `<div class="empty">数据加载失败：${error.message}</div>`;
});
