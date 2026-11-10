const $ = (selector) => document.querySelector(selector);
let database, type = "weapon", setName, saving = false, dirty = false, currentPlan = [], planStale = false;
let sampleItems = [], sampleHasGenerated = false, sampleCardMinWidth = 0, sampleGridResizeObserver, sampleFilter = "all";
let sampleSetSelection = null, sampleMainSelections = { weapon: null, armor: null };
let sampleFilterOptionsDirty = false, sampleMenuName = null, sampleMenuOpener = null;
let sampleEnhancementLevel = 0;
const history = [];
const OPTION_LABELS = {
  "약공": "약점 공격 확률", "약확": "약점 공격 확률", "치확": "치명타 확률", "치피": "치명타 피해",
  "모공퍼": "모든 공격력(%)", "방퍼": "방어력(%)", "생퍼": "생명력(%)",
  "모든 공격력(고정)": "모든 공격력", "방어력(고정)": "방어력", "생명력(고정)": "생명력",
  "막확": "막기 확률", "효적": "효과 적중", "효저": "효과 저항", "받피감": "받는 피해 감소",
};
const SUB_ORDER = ["모든 공격력(고정)", "모공퍼", "방어력(고정)", "방퍼", "생명력(고정)", "생퍼", "속공", "치확", "치피", "약확", "막확", "효적", "효저"];
const MAIN_ORDER = ["약공", "약확", "치확", "치피", "모공퍼", "모든 공격력(고정)", "방퍼", "방어력(고정)", "생퍼", "생명력(고정)", "받피감", "속공", "효적", "효저"];
const ARMOR_MAIN_ORDER = ["받피감", "막확", "모공퍼", "모든 공격력(고정)", "방퍼", "방어력(고정)", "생퍼", "생명력(고정)", "효저"];
const SET_ABBREVIATIONS = { "선봉장": "선봉", "추적자": "추적", "성기사": "기사", "수문장": "수문", "수호자": "수호", "암살자": "암살", "복수자": "복수", "주술사": "주술", "조율자": "조율" };
const PRESET_SET_CODES = { "선봉장": "선", "추적자": "추", "성기사": "기", "수문장": "문", "수호자": "호", "암살자": "암", "복수자": "복", "주술사": "술", "조율자": "조" };
const PRESET_MAIN_CODES = {
  "약공": "약공", "약확": "약확", "치확": "치확", "치피": "치피", "모공퍼": "공", "방퍼": "방", "생퍼": "생",
  "모든 공격력(고정)": "공", "방어력(고정)": "방", "생명력(고정)": "생", "받피감": "받피감", "막확": "막", "효적": "효적", "효저": "효저", "속공": "속",
};
const PRESET_MAIN_TINY_CODES = {
  "약공": "약", "약확": "확", "치확": "치", "치피": "피", "모공퍼": "공", "모든 공격력(고정)": "공0",
  "방퍼": "방", "방어력(고정)": "방0", "생퍼": "생", "생명력(고정)": "생0", "받피감": "받", "막확": "막", "효적": "적", "효저": "저", "속공": "속",
};
const MAX_PRESET_NAME_BYTES = 32;
const SET_ORDER = ["선봉장", "추적자", "성기사", "수문장", "수호자", "암살자", "복수자", "주술사", "조율자"];
const SAMPLE_MAIN_OPTIONS = {
  weapon: ["약공", "치확", "치피", "모공퍼", "모든 공격력(고정)", "방퍼", "방어력(고정)", "생퍼", "생명력(고정)", "효적"],
  armor: ["받피감", "막확", "모공퍼", "모든 공격력(고정)", "방퍼", "방어력(고정)", "생퍼", "생명력(고정)", "효저"],
};
const SAMPLE_SUBSTAT_VALUES = {
  "모든 공격력(고정)": 50, "모공퍼": 5, "방어력(고정)": 30, "방퍼": 5, "생명력(고정)": 180, "생퍼": 5,
  "속공": 4, "치확": 4, "치피": 6, "약확": 5, "막확": 4, "효적": 5, "효저": 5,
};
const SAMPLE_PERCENT_SUBSTATS = new Set(["모공퍼", "방퍼", "생퍼", "치확", "치피", "약확", "막확", "효적", "효저"]);
const OPTION_ICON_KEYS = {
  "모든 공격력(고정)": "swords", "모공퍼": "swordsPercent", "방어력(고정)": "shield", "방퍼": "shieldPercent",
  "생명력(고정)": "heart", "생퍼": "heartPercent", "속공": "speed", "치확": "crit", "치피": "critDamage",
  "약확": "target", "약공": "target", "막확": "block", "효적": "stars", "효저": "resist", "받피감": "reduce",
};
function orderedOptions(options, preferred) {
  const available = new Set(options);
  return [...preferred.filter((name) => available.has(name)), ...options.filter((name) => !preferred.includes(name))];
}

function onlyAllChecked(options, values) {
  return options.length > 0 && options.every((name) => values.has(name)) ? new Set(["모두"]) : values;
}

function valid(value) {
  if (value?.schemaVersion !== 2) return false;
  return ["weapon", "armor"].every((kind) => {
    const sets = value.equipment?.[kind]?.sets;
    return sets && Object.values(sets).every((set) =>
      Array.isArray(set.mainOptions) && Array.isArray(set.subOptions) &&
      set.mainOptions.every((name) => typeof name === "string") &&
      set.subOptions.every((name) => typeof name === "string") &&
      Array.isArray(set.cells) && set.cells.length === set.subOptions.length &&
      set.cells.every((row) => Array.isArray(row) && row.length === set.mainOptions.length && row.every((cell) => typeof cell === "boolean")));
  });
}

async function save() {
  dirty = true;
  if (saving) return;
  saving = true;
  try {
    while (dirty) {
      dirty = false;
      $("#status").textContent = "저장 중";
      const response = await fetch("/api/presets", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(database),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장 실패");
    }
    $("#status").textContent = "presets.json 저장됨";
    $("#error").hidden = true;
  } catch (error) {
    $("#status").textContent = "저장 실패";
    $("#error").textContent = error.message;
    $("#error").hidden = false;
  } finally { saving = false; }
}

const current = () => database.equipment[type].sets[setName];
const state = (values) => values.every(Boolean) ? "used" : values.every((v) => !v) ? "unused" : "mixed";

function button(label, className, action, description = label) {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = label;
  item.className = className;
  item.setAttribute("aria-label", description);
  item.addEventListener("click", action);
  return item;
}

function change(points) {
  const cells = current().cells;
  const before = points.map(([row, col]) => [row, col, cells[row][col]]);
  const allUsed = before.every(([, , used]) => used);
  for (const [row, col] of points) cells[row][col] = points.length === 1 ? !cells[row][col] : !allUsed;
  history.push({ type, setName, before });
  if (history.length > 50) history.shift();
  planStale = true;
  render();
  updateGenerationStatus();
  save();
}

function updateGenerationStatus() {
  $("#generation-status").textContent = planStale ? "옵션 변경됨 · 다시 생성하세요" : "현재 설정 기준";
  $("#generate").textContent = planStale ? "다시 생성" : "프리셋 생성";
}

function render() {
  const sets = database.equipment[type].sets;
  if (!sets[setName]) setName = Object.keys(sets)[0];
  const set = current();
  document.querySelectorAll("[data-type]").forEach((tab) => tab.setAttribute("aria-pressed", tab.dataset.type === type));
  $("#undo").disabled = !history.length;
  $("#sets").replaceChildren(...orderedOptions(Object.keys(sets), SET_ORDER).map((name) => {
    const item = button(name, "", () => { setName = name; render(); });
    item.setAttribute("aria-current", name === setName);
    return item;
  }));
  const equipmentName = type === "weapon" ? "무기" : "방어구";
  $("#title").textContent = `${equipmentName} / ${setName} 세트`;
  const table = $("#matrix");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  head.append(document.createElement("th"));
  head.cells[0].textContent = "부옵션 ↓ / 주옵션 →";
  set.mainOptions.forEach((name, col) => {
    const values = set.cells.map((row) => row[col]);
    const cell = document.createElement("th");
    cell.scope = "col";
    const headerButton = button(name, state(values), () => change(set.cells.map((_, row) => [row, col])), `${name} 열 전체 전환`);
    cell.append(headerButton);
    head.append(cell);
  });
  const body = table.createTBody();
  set.subOptions.forEach((name, row) => {
    const tr = body.insertRow();
    const label = document.createElement("th");
    label.scope = "row";
    label.append(button(name, state(set.cells[row]), () => change(set.mainOptions.map((_, col) => [row, col])), `${name} 행 전체 전환`));
    tr.append(label);
    set.mainOptions.forEach((main, col) => {
      const used = set.cells[row][col];
      const cellButton = button(used ? "\u2713" : "\u00d7", used ? "used" : "unused", () => change([[row, col]]), `${name} \u00d7 ${main}: ${used ? "\uc0ac\uc6a9" : "\ubbf8\uc0ac\uc6a9"}`);
      tr.insertCell().append(cellButton);
    });
  });
}

$("#undo").onclick = () => {
  const action = history.pop();
  if (!action) return;
  if (action.presetOverride) {
    const { key, before, legacyKey, legacyBefore } = action.presetOverride;
    if (before === undefined) delete database.presetOverrides[key];
    else database.presetOverrides[key] = before;
    if (legacyKey) {
      if (legacyBefore === undefined) delete database.presetOverrides[legacyKey];
      else database.presetOverrides[legacyKey] = legacyBefore;
    }
    renderPlan();
    if (sampleItems.length) renderSampleResults();
    save();
    return;
  }
  if (action.presetComparators || action.presetBulkSettings) {
    const snapshot = action.presetBulkSettings || action.presetComparators;
    database.presetOverrides = snapshot.beforeOverrides;
    database.presetComparators = snapshot.beforeComparators;
    if (snapshot.beforeCounts) database.presetCounts = snapshot.beforeCounts;
    if (snapshot.beforeCountCustom) database.presetCountCustom = snapshot.beforeCountCustom;
    renderPlan();
    if (sampleItems.length) renderSampleResults();
    save();
    return;
  }
  if (action.edits) {
    for (const edit of action.edits) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = edit.before;
    type = action.edits[0]?.kind || type;
    setName = action.edits[0]?.setName || setName;
  } else {
    const cells = database.equipment[action.type].sets[action.setName].cells;
    action.before.forEach(([row, col, value]) => { cells[row][col] = value; });
    type = action.type;
    setName = action.setName;
  }
  planStale = true;
  render();
  updateGenerationStatus();
  save();
};
document.querySelectorAll("[data-type]").forEach((tab) => tab.onclick = () => { type = tab.dataset.type; setName = undefined; render(); });

function buildPresetPlan() {
  const plan = [];
  for (const kind of ["weapon", "armor"]) {
    const profiles = new Map();
    for (const [name, set] of Object.entries(database.equipment[kind].sets)) {
      set.mainOptions.forEach((main, col) => {
        const mainIsUsed = set.cells.some((row) => row[col]);
        const saleOptions = mainIsUsed
          ? set.subOptions.filter((_, row) => !set.cells[row][col])
          : set.subOptions;
        if (mainIsUsed && !saleOptions.length) return;
        const minCount = mainIsUsed ? Math.min(2, saleOptions.length) : 1;
        const key = JSON.stringify([saleOptions, minCount]);
        if (!profiles.has(key)) profiles.set(key, { saleOptions, minCount, bySet: new Map() });
        if (!profiles.get(key).bySet.has(name)) profiles.get(key).bySet.set(name, new Set());
        profiles.get(key).bySet.get(name).add(main);
      });
    }

    for (const { saleOptions, minCount, bySet } of profiles.values()) {
      const sets = [...bySet.keys()];
      const remaining = new Map([...bySet].map(([set, mains]) => [set, new Set(mains)]));
      while ([...remaining.values()].some((mains) => mains.size)) {
        let best = null;
        for (let mask = 1; mask < 2 ** sets.length; mask++) {
          const chosenSets = sets.filter((_, i) => mask & (1 << i));
          let common = [...remaining.get(chosenSets[0])];
          for (const set of chosenSets.slice(1)) common = common.filter((main) => remaining.get(set).has(main));
          if (!common.length) continue;
          const area = chosenSets.length * common.length;
          if (!best || area > best.area || (area === best.area && chosenSets.length > best.sets.length)) {
            best = { sets: chosenSets, mains: common, area };
          }
        }
        if (!best) break;
        for (const set of best.sets) for (const main of best.mains) remaining.get(set).delete(main);
        plan.push({
          kind,
          sets: best.sets,
          mains: best.mains,
          saleOptions,
          minCount,
        });
      }
    }
  }
  const allSubOptions = Object.fromEntries(["weapon", "armor"].map((kind) => [
    kind,
    [...new Set(Object.values(database.equipment[kind].sets).flatMap((set) => set.subOptions))],
  ]));
  return plan.sort((a, b) => {
    const kindOrder = (a.kind === "weapon" ? 0 : 1) - (b.kind === "weapon" ? 0 : 1);
    if (kindOrder) return kindOrder;
    const discardOrder = Number(isDiscardRule(b, allSubOptions[b.kind])) - Number(isDiscardRule(a, allSubOptions[a.kind]));
    return discardOrder || b.sets.length * b.mains.length - a.sets.length * a.mains.length || b.sets.length - a.sets.length || b.mains.length - a.mains.length;
  });
}

function reductionCandidates() {
  const groups = new Map();
  for (const kind of ["weapon", "armor"]) {
    for (const [setName, set] of Object.entries(database.equipment[kind].sets)) {
      set.mainOptions.forEach((main, col) => {
        const used = set.cells.some((row) => row[col]);
        const saleOptions = set.subOptions.filter((_, row) => !set.cells[row][col]);
        if (used && !saleOptions.length) return;
        const minCount = used ? Math.min(2, saleOptions.length) : 1;
        const key = JSON.stringify([kind, [...saleOptions].sort(), minCount]);
        if (!groups.has(key)) groups.set(key, { key, kind, saleOptions, minCount, entries: [] });
        groups.get(key).entries.push({ setName, col, main });
      });
    }
  }

  const candidates = [];
  for (const source of groups.values()) for (const target of groups.values()) {
    if (source === target || source.kind !== target.kind) continue;
    const differences = [...new Set([...source.saleOptions, ...target.saleOptions])].filter((name) => source.saleOptions.includes(name) !== target.saleOptions.includes(name));
    if (!differences.length || differences.length > 3) continue;
    for (const entry of source.entries) {
      const set = database.equipment[source.kind].sets[entry.setName];
      const edits = [];
      for (const name of differences) {
        const row = set.subOptions.indexOf(name);
        if (row < 0) break;
        const value = target.saleOptions.includes(name) ? false : true;
        if (set.cells[row][entry.col] !== value) edits.push({ kind: source.kind, setName: entry.setName, row, col: entry.col, value });
      }
      if (!edits.length || edits.length !== differences.length) continue;
      const saleAfter = set.subOptions.filter((_, row) => {
        const edit = edits.find((item) => item.row === row);
        return !(edit ? edit.value : set.cells[row][entry.col]);
      });
      const usedAfter = set.subOptions.some((_, row) => {
        const edit = edits.find((item) => item.row === row);
        return edit ? edit.value : set.cells[row][entry.col];
      });
      const afterKey = JSON.stringify([source.kind, [...saleAfter].sort(), usedAfter ? Math.min(2, saleAfter.length) : 1]);
      if (afterKey !== target.key) continue;
      candidates.push({ kind: source.kind, profileCount: groups.size, source: source.saleOptions, target: target.saleOptions, targetMinCount: target.minCount, targetSize: target.entries.length, targetEntries: target.entries.map(({ setName, main }) => [setName, main]), edits });
    }
  }
  const unique = new Map(candidates.map((candidate) => [JSON.stringify(candidate.edits), candidate]));
  return [...unique.values()].sort((a, b) => a.edits.length - b.edits.length || b.targetSize - a.targetSize);
}

function chooseCount(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return result;
}

function validMainCombinationCounts(set) {
  const optionCount = set.subOptions.length;
  return set.mainOptions.map((main, col) => {
    const validCount = set.cells.reduce((sum, row) => sum + Number(row[col]), 0);
    let count = 0;
    for (let validSubs = 3; validSubs <= 4; validSubs++) {
      count += chooseCount(validCount, validSubs) * chooseCount(optionCount - validCount, 4 - validSubs);
    }
    return { main, count };
  });
}

function validCombinationCount(set) {
  return validMainCombinationCounts(set).reduce((sum, item) => sum + item.count, 0);
}

function appendInventoryShare(panel) {
  panel.replaceChildren();
  const section = document.createElement("section");
  section.className = "inventory-share";
  const heading = document.createElement("h3");
  heading.textContent = "예상 점유율 · 전체 세트";
  const note = document.createElement("p");
  note.textContent = "유효 부옵션 3개 이상 기준 · 주옵션 비율: 세트 내 / 부위 전체";
  section.append(heading, note);
  const columns = document.createElement("div");
  columns.className = "inventory-share-columns";
  for (const kind of ["weapon", "armor"]) {
    const entries = Object.entries(database.equipment[kind].sets).map(([name, set]) => {
      const mains = validMainCombinationCounts(set);
      return { name, set, mains, count: mains.reduce((sum, item) => sum + item.count, 0) };
    });
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    const column = document.createElement("div");
    column.className = "inventory-share-kind";
    const title = document.createElement("h4");
    title.textContent = kind === "weapon" ? "무기" : "방어구";
    column.append(title);
    entries.sort((a, b) => b.count - a.count).forEach((item, rank) => {
      const card = document.createElement("section");
      card.className = "share-set-card";
      const setHeader = document.createElement("div");
      setHeader.className = "share-set-heading";
      const name = document.createElement("strong");
      name.textContent = (rank + 1) + ". " + item.name;
      const share = total ? item.count / total * 100 : 0;
      const percentage = document.createElement("strong");
      percentage.textContent = share.toFixed(1) + "%";
      setHeader.append(name, percentage);
      card.append(setHeader);

      const mainsHeading = document.createElement("small");
      mainsHeading.className = "share-subheading";
      mainsHeading.textContent = "주옵션 TOP 3";
      card.append(mainsHeading);
      const mainList = document.createElement("div");
      mainList.className = "share-breakdown";
      const mainGroups = new Map();
      for (const entry of item.mains) {
        const percentage = item.count ? (entry.count / item.count * 100).toFixed(1) : "0.0";
        if (Number(percentage) === 0) continue;
        if (!mainGroups.has(percentage)) mainGroups.set(percentage, []);
        mainGroups.get(percentage).push(entry);
      }
      [...mainGroups.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 3).forEach(([percentage, entries]) => {
        const label = entries.length === 1
          ? entries[0].main
          : entries.map((entry) => [...entry.main][0]).join(" / ");
        appendShareRow(mainList, label, entries[0].count, item.count, total, `${entries.map((entry) => entry.main).join(" · ")} — ${percentage}%`);
      });
      card.append(mainList);

      const presetCounts = new Map();
      let noPreset = 0;
      for (const entry of item.mains) {
        if (!entry.count) continue;
        const ruleIndex = currentPlan.findIndex((rule) => rule.kind === kind && rule.sets.includes(item.name) && rule.mains.includes(entry.main));
        if (ruleIndex < 0) noPreset += entry.count;
        else presetCounts.set(ruleIndex + 1, (presetCounts.get(ruleIndex + 1) || 0) + entry.count);
      }
      const presetHeading = document.createElement("small");
      presetHeading.className = "share-subheading";
      presetHeading.textContent = "프리셋 TOP 3 · 세트 내 비중";
      card.append(presetHeading);
      const presetList = document.createElement("div");
      presetList.className = "share-breakdown";
      [...presetCounts.entries()].filter(([, value]) => item.count && Number((value / item.count * 100).toFixed(1)) > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([number, value]) => {
        appendPresetShareRow(presetList, number + "번 프리셋", value, item.count);
      });
      if (noPreset && item.count && Number((noPreset / item.count * 100).toFixed(1)) > 0) appendPresetShareRow(presetList, "미분류", noPreset, item.count);
      card.append(presetList);
      column.append(card);
    });
    columns.append(column);
  }
  section.append(columns);
  panel.append(section);
}

function appendShareRow(list, label, count, setTotal, partTotal, tooltip = label) {
  const row = document.createElement("div");
  row.className = "share-breakdown-row";
  const name = document.createElement("span");
  name.textContent = label;
  const meter = document.createElement("span");
  meter.className = "share-meter";
  const fill = document.createElement("span");
  fill.style.width = Math.min(100, setTotal ? count / setTotal * 100 : 0) + "%";
  meter.append(fill);
  const values = document.createElement("strong");
  const setShare = setTotal ? count / setTotal * 100 : 0;
  const partShare = partTotal ? count / partTotal * 100 : 0;
  values.textContent = setShare.toFixed(1) + "% / " + partShare.toFixed(1) + "%";
  row.title = tooltip;
  row.append(name, meter, values);
  list.append(row);
}

function appendPresetShareRow(list, label, count, setTotal) {
  const row = document.createElement("div");
  row.className = "share-breakdown-row preset-share-row";
  const name = document.createElement("span");
  name.textContent = label;
  const meter = document.createElement("span");
  meter.className = "share-meter";
  const fill = document.createElement("span");
  const ratio = setTotal ? count / setTotal * 100 : 0;
  fill.style.width = Math.min(100, ratio) + "%";
  meter.append(fill);
  const value = document.createElement("strong");
  value.textContent = ratio.toFixed(1) + "%";
  row.title = `${label}: 세트 유효 조합 ${count.toLocaleString()} / ${setTotal.toLocaleString()}`;
  row.append(name, meter, value);
  list.append(row);
}

function renderRecommendations() {
  const panel = $("#recommendations");
  panel.replaceChildren();
  panel.hidden = false;
  const heading = document.createElement("h3");
  heading.textContent = "판매 프리셋 제거 우선순위";
  const options = reductionCandidates();
  const note = document.createElement("p");
  note.textContent = "같은 세트·주옵에서 최대 3셀을 바꿔 다른 옵션 그룹에 편입할 수 있는 후보를 찾습니다. 우선순위는 예상 프리셋 감소량과 편입 대상 그룹의 크기를 반영합니다.";
  panel.append(heading, note);
  appendInventoryShare($("#inventory-share-panel"));
  const tested = [];
  for (const candidate of options) {
    const before = candidate.edits.map((edit) => database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col]);
    for (const edit of candidate.edits) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = edit.value;
    const afterPlan = buildPresetPlan();
    const transitions = candidate.edits.map((edit) => {
      const set = database.equipment[edit.kind].sets[edit.setName];
      const main = set.mainOptions[edit.col];
      const source = currentPlan.findIndex((rule) => rule.kind === edit.kind && rule.sets.includes(edit.setName) && rule.mains.includes(main)) + 1;
      const targetRules = currentPlan.map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => rule.kind === candidate.kind && rule.minCount === candidate.targetMinCount &&
          JSON.stringify([...rule.saleOptions].sort()) === JSON.stringify([...candidate.target].sort()))
        .map(({ rule, index }) => ({ index, overlap: candidate.targetEntries.filter(([targetSet, targetMain]) => rule.sets.includes(targetSet) && rule.mains.includes(targetMain)).length }))
        .filter(({ overlap }) => overlap > 0)
        .sort((a, b) => b.overlap - a.overlap || a.index - b.index);
      const destination = (targetRules[0]?.index ?? -1) + 1;
      return source > 0 && destination > 0 ? `${source}번 → ${destination}번` : "";
    }).filter(Boolean);
    for (const [index, edit] of candidate.edits.entries()) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = before[index];
    tested.push({ ...candidate, count: afterPlan.length, saved: currentPlan.length - afterPlan.length, transitions: [...new Set(transitions)] });
  }
  tested.sort((a, b) => b.saved / b.edits.length - a.saved / a.edits.length || b.targetSize - a.targetSize || a.edits.length - b.edits.length);
  const priority = tested.filter((candidate) => candidate.saved > 0);

  const table = document.createElement("table");
  table.className = "removal-priority";
  table.innerHTML = "<thead><tr><th>순위</th><th>변경할 셀</th><th>그룹 편입</th><th>예상 감소</th><th>적용</th></tr></thead>";
  const body = table.createTBody();
  priority.forEach((candidate, index) => {
    const row = body.insertRow();
    row.insertCell().textContent = String(index + 1);
    row.insertCell().textContent = candidate.edits.map((edit) => {
      const set = database.equipment[edit.kind].sets[edit.setName];
      return (edit.kind === "weapon" ? "무기" : "방어구") + " › " + edit.setName + " › " + set.mainOptions[edit.col] + " › " + set.subOptions[edit.row] + " (" + (edit.value ? "사용" : "미사용") + ")";
    }).join(" + ");
    row.insertCell().textContent = candidate.transitions.length
      ? candidate.transitions.join(", ")
      : "편입 프리셋 확인 불가";
    row.insertCell().textContent = candidate.saved + "개 감소";
    const applyCell = row.insertCell();
    const apply = button("적용", "priority-apply", () => applyReduction(candidate), "이 후보 적용 후 " + candidate.count + "개 예상");
    applyCell.append(apply);
    ["순위", "변경할 셀", "편입", "감소", "적용"].forEach((label, cellIndex) => { row.cells[cellIndex].dataset.label = label; });
  });
  panel.append(table);
  if (!priority.length) {
    const empty = document.createElement("p");
    empty.textContent = "같은 세트·주옵에서 최대 3셀 변경으로 프리셋 수를 줄이는 후보가 없습니다.";
    panel.append(empty);
  }
  if (currentPlan.length > 30) {
    const direct = priority.filter((candidate) => candidate.count <= 30).sort((a, b) => b.targetSize - a.targetSize || a.count - b.count || a.edits.length - b.edits.length).slice(0, 3);
    for (const candidate of direct) {
      const action = button("바로 적용 · " + candidate.count + "개 (" + candidate.edits.length + "셀)", "recommendation", () => applyReduction(candidate));
      panel.append(action);
    }
    const search = button("셀 후보 조합으로 30개 이하 찾기", "recommendation", () => searchReductionCombinations(tested));
    panel.append(search);
    const results = document.createElement("div");
    results.id = "combination-results";
    panel.append(results);
  }
}

function searchReductionCombinations(tested) {
  const results = $("#combination-results");
  results.replaceChildren();
  const title = document.createElement("h4");
  title.textContent = "조합 추천";
  results.append(title);
  const pool = [...tested].sort((a, b) => b.targetSize - a.targetSize || b.saved / b.edits.length - a.saved / a.edits.length).slice(0, 8);
  const solutions = [];
  const maxDepth = 3;
  function search(start, chosen, usedCells) {
    if (chosen.length >= maxDepth) return;
    for (let i = start; i < pool.length; i++) {
      const candidate = pool[i];
      const keys = candidate.edits.map((edit) => [edit.kind, edit.setName, edit.row, edit.col].join("|"));
      if (keys.some((key) => usedCells.has(key))) continue;
      for (const edit of candidate.edits) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = edit.value;
      const count = buildPresetPlan().length;
      const next = [...chosen, candidate];
      const combined = next.flatMap((item) => item.edits);
      if (next.length >= 2 && count <= 30) {
        solutions.push({ kind: combined[0].kind, edits: combined, count, support: next.reduce((sum, item) => sum + item.targetSize, 0) });
      } else if (count > 30) {
        const nextUsed = new Set([...usedCells, ...keys]);
        search(i + 1, next, nextUsed);
      }
      for (const edit of candidate.edits) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = !edit.value;
    }
  }
  search(0, [], new Set());
  const unique = new Map(solutions.map((solution) => [JSON.stringify(solution.edits.map((edit) => [edit.kind, edit.setName, edit.row, edit.col, edit.value])), solution]));
  const best = [...unique.values()].sort((a, b) => a.edits.length - b.edits.length || b.support - a.support || a.count - b.count).slice(0, 3);
  if (!best.length) {
    const empty = document.createElement("p");
    empty.textContent = "검사한 후보 조합에서는 30개 이하가 되는 방법을 찾지 못했습니다.";
    results.append(empty);
    return;
  }
  best.forEach((solution, index) => {
    const card = document.createElement("div");
    card.className = "recommendation-card";
    const summary = document.createElement("strong");
    summary.textContent = (index + 1) + "안 · " + solution.edits.length + "셀 변경 → " + solution.count + "개";
    const details = document.createElement("small");
    details.textContent = solution.edits.map((edit) => {
      const set = database.equipment[edit.kind].sets[edit.setName];
      return (edit.kind === "weapon" ? "무기" : "방어구") + " › " + edit.setName + " › " + set.mainOptions[edit.col] + " › " + set.subOptions[edit.row] + " (" + (edit.value ? "사용" : "미사용") + ")";
    }).join(" · ");
    const apply = button("이 조합 적용", "recommendation", () => applyReduction(solution));
    card.append(summary, details, apply);
    results.append(card);
  });
}

function applyReduction(candidate) {
  const edits = candidate.edits.map((edit) => ({ ...edit, before: database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] }));
  history.push({ edits });
  if (history.length > 50) history.shift();
  for (const edit of edits) database.equipment[edit.kind].sets[edit.setName].cells[edit.row][edit.col] = edit.value;
  type = candidate.kind;
  setName = edits[0]?.setName;
  planStale = true;
  render();
  save();
  generatePresets();
}

function optionGroup(title, choices, selected) {
  const group = document.createElement("section");
  group.className = "rule-group";
  group.setAttribute("aria-readonly", "true");
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "choices";
  for (const name of choices) {
    const chip = document.createElement("span");
    chip.className = `choice ${selected.has(name) ? "selected" : ""}`;
    chip.textContent = OPTION_LABELS[name] || name;
    chip.setAttribute("aria-checked", String(selected.has(name)));
    chip.setAttribute("role", "checkbox");
    chip.setAttribute("aria-readonly", "true");
    list.append(chip);
  }
  group.append(heading, list);
  return group;
}

function defaultSubOptionRule(included, comparator = "gte") {
  const count = comparator === "lte" ? (included ? 3 : 5) : (included ? 0 : 2);
  return { count, comparator, mode: included ? "check" : "prevent" };
}

function globalComparatorFor(mode) {
  return database.presetComparators?.[mode] || "gte";
}

function ensureGlobalPresetSettings() {
  database.presetComparators ||= { include: database.presetComparator || "gte", exclude: database.presetComparator || "gte" };
  database.presetCounts ||= {};
  database.presetCountCustom ||= { include: false, exclude: false };
  for (const mode of ["include", "exclude"]) {
    if (!Number.isInteger(database.presetCounts[mode]) || database.presetCounts[mode] < 0 || database.presetCounts[mode] > 5) {
      database.presetCounts[mode] = defaultSubOptionRule(mode === "include", globalComparatorFor(mode)).count;
    }
  }
}

function globalCountFor(mode) {
  return Number.isInteger(database.presetCounts?.[mode])
    ? database.presetCounts[mode]
    : defaultSubOptionRule(mode === "include", globalComparatorFor(mode)).count;
}

function defaultPresetSubOptionRule(included) {
  const mode = included ? "include" : "exclude";
  return { count: globalCountFor(mode), comparator: globalComparatorFor(mode), mode: included ? "check" : "prevent" };
}

function updatePresetSetting(rule, update) {
  database.presetOverrides ||= {};
  const key = rule._key;
  const legacyKey = rule._legacyKey;
  const existing = database.presetOverrides[key] || database.presetOverrides[legacyKey] || {};
  const before = database.presetOverrides[key] ? JSON.parse(JSON.stringify(database.presetOverrides[key])) : undefined;
  const legacyBefore = legacyKey && database.presetOverrides[legacyKey]
    ? JSON.parse(JSON.stringify(database.presetOverrides[legacyKey])) : undefined;
  history.push({ presetOverride: { key, before, legacyKey, legacyBefore } });
  if (history.length > 50) history.shift();
  const override = JSON.parse(JSON.stringify(existing));
  if (legacyKey !== key) delete database.presetOverrides[legacyKey];
  update(override);
  database.presetOverrides[key] = override;
  renderPlan();
  if (sampleItems.length) renderSampleResults();
  save();
}

function renderSubOptionGroup(allSubs, rule) {
  const group = document.createElement("section");
  group.className = "rule-group game-sub-group";
  const heading = document.createElement("h4");
  heading.textContent = "서브 옵션";
  const rows = document.createElement("div");
  rows.className = "game-sub-rows";
  const saleOptions = new Set(rule.saleOptions);
  const discardPreset = Boolean(rule._discardPreset || rule.discardPreset);
  const settingsFor = (name) => rule.subOptionRules?.[name] || defaultPresetSubOptionRule(saleOptions.has(name));
  const allSelected = typeof rule.allSubOptions === "boolean"
    ? rule.allSubOptions
    : allSubs.length > 0 && allSubs.every((name) => saleOptions.has(name));
  const addRow = (optionKey, labelText, settings, summary = false) => {
    const showDetails = !summary && !allSelected && (settings.mode === "check" || settings.mode === "prevent");
    const row = document.createElement("div");
    row.className = "game-sub-row" + (summary ? " summary" : "") + (allSelected ? " disabled" : !showDetails ? " no-details" : "");
    if (summary) {
      const all = document.createElement("button");
      all.type = "button";
      all.className = "game-sub-all-button" + (allSelected ? " active" : "");
      all.textContent = "모두";
      all.setAttribute("aria-pressed", String(allSelected));
      all.disabled = allSelected;
      all.addEventListener("click", () => {
        if (!allSelected) updatePresetSetting(rule, (override) => { override.allSubOptions = true; });
      });
      row.append(all);
      rows.append(row);
      return;
    }
    const label = document.createElement("span");
    label.className = "game-sub-name";
    label.textContent = labelText;
    const stepper = document.createElement("span");
    stepper.className = "game-sub-stepper";
    for (const value of ["−", String(settings.count), "+"]) {
      const control = document.createElement("button");
      control.type = "button";
      control.className = value === "−" || value === "+" ? "step" : "value";
      control.textContent = value;
      control.setAttribute("aria-label", value === "−" ? "개수 감소" : value === "+" ? "개수 증가" : value + "회 (0~5)");
      if (value === "−" || value === "+") {
        control.disabled = value === "−" ? settings.count <= 0 : settings.count >= 5;
        control.addEventListener("click", () => updatePresetSetting(rule, (override) => {
          override.subOptionRules ||= {};
          const current = override.subOptionRules[optionKey] || defaultPresetSubOptionRule(saleOptions.has(optionKey));
          override.subOptionRules[optionKey] = { ...current, count: Math.max(0, Math.min(5, current.count + (value === "+" ? 1 : -1))) };
        }));
      } else control.disabled = true;
      stepper.append(control);
    }
    const comparators = document.createElement("span");
    comparators.className = "game-sub-comparators";
    for (const [label, nextComparator] of [["이상", "gte"], ["이하", "lte"]]) {
      const control = document.createElement("button");
      control.type = "button";
      control.className = `compare ${nextComparator === "gte" ? "is-gte" : "is-lte"}` + (settings.comparator === nextComparator ? " active" : "");
      control.textContent = label;
      control.setAttribute("aria-pressed", String(settings.comparator === nextComparator));
      control.addEventListener("click", () => updatePresetSetting(rule, (override) => {
        override.subOptionRules ||= {};
        const current = override.subOptionRules[optionKey] || defaultPresetSubOptionRule(saleOptions.has(optionKey));
        override.subOptionRules[optionKey] = {
          ...current,
          comparator: nextComparator,
        };
      }));
      comparators.append(control);
    }
    const states = document.createElement("span");
    states.className = "game-sub-states";
    for (const [text, kind, mode] of [["✓", "sell", "check"], ["⊘", "include", "prevent"]]) {
      const state = document.createElement("button");
      state.type = "button";
      const active = !allSelected && settings.mode === mode;
      state.className = "game-sub-state " + kind + (active ? " active" : "");
      state.textContent = text;
      state.title = allSelected
        ? (mode === "check" ? "선택하여 이 옵션만 포함 조건으로 활성화" : "선택하여 이 옵션만 제외 조건으로 활성화")
        : (mode === "check" ? "체크 · 포함" : "방지 · 제외");
      state.setAttribute("aria-checked", String(active));
      state.setAttribute("aria-pressed", String(active));
      if (allSelected) state.classList.add("inactive");
      const chooseMode = () => updatePresetSetting(rule, (override) => {
        override.subOptionRules ||= {};
        if (allSelected) {
          for (const option of allSubs) {
            const current = override.subOptionRules[option] || defaultPresetSubOptionRule(saleOptions.has(option));
            override.subOptionRules[option] = { ...current, mode: "none" };
          }
          const current = override.subOptionRules[optionKey];
          const saved = rule.subOptionRules?.[optionKey];
          const optionComparator = saved?.comparator || current.comparator || globalComparatorFor(mode === "check" ? "include" : "exclude");
          const savedDefault = saved && saved.mode !== "none"
            ? globalCountFor(saved.mode === "check" ? "include" : "exclude")
            : undefined;
          override.subOptionRules[optionKey] = {
            ...current,
            mode,
            count: saved && saved.mode !== "none" && saved.count !== savedDefault
              ? saved.count
              : globalCountFor(mode === "check" ? "include" : "exclude"),
            comparator: optionComparator,
          };
          override.allSubOptions = false;
        } else {
          const current = override.subOptionRules[optionKey] || defaultPresetSubOptionRule(saleOptions.has(optionKey));
          const nextMode = current.mode === mode ? "none" : mode;
          const comparator = current.comparator || globalComparatorFor(mode === "check" ? "include" : "exclude");
          const oldDefault = globalCountFor(current.mode === "check" ? "include" : "exclude");
          const nextDefault = globalCountFor(mode === "check" ? "include" : "exclude");
          override.subOptionRules[optionKey] = {
            ...current,
            mode: nextMode,
            count: nextMode !== "none" && (current.mode === "none" || current.count === oldDefault) ? nextDefault : current.count,
            comparator,
          };
        }
        override.saleOptions = allSubs.filter((option) =>
          (override.subOptionRules[option] || defaultPresetSubOptionRule(saleOptions.has(option))).mode === "check");
      });
      state.addEventListener("click", chooseMode);
      states.append(state);
    }
    row.append(label);
    if (showDetails) row.append(stepper, comparators);
    row.append(states);
    rows.append(row);
  };
  addRow(null, "모두", null, true);
  for (const name of allSubs) addRow(name, OPTION_LABELS[name] || name, settingsFor(name));
  const threshold = document.createElement("div");
  threshold.className = "game-sub-threshold" + (discardPreset ? " disabled" : "");
  const caption = document.createElement("span");
  caption.textContent = "포함 상태 서브 옵션 개수";
  const values = document.createElement("div");
  values.className = "game-sub-counts";
  for (let count = 1; count <= 4; count += 1) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "game-sub-count" + (count === rule.minCount ? " active" : "");
    item.textContent = count + "개 이상";
    item.setAttribute("aria-pressed", String(count === rule.minCount));
    item.disabled = discardPreset;
    if (!discardPreset) item.addEventListener("click", () => updatePresetSetting(rule, (override) => { override.minCount = count; }));
    values.append(item);
  }
  threshold.append(caption, values);
  group.append(heading, rows, threshold);
  return group;
}

function planKey(rule) {
  return JSON.stringify([rule.kind, [...rule.sets].sort(), [...rule.mains].sort(), [...rule.saleOptions].sort(), rule._baseMinCount ?? rule.minCount]);
}

function legacyPlanKey(rule) {
  return JSON.stringify([rule.kind, [...rule.sets].sort(), [...rule.mains].sort(), [...rule.saleOptions].sort(), rule._baseMinCount ?? rule.minCount]);
}

let selectedPresetKey;

function presetFullName(rule, allSubs) {
  const sets = rule.sets.map((name) => SET_ABBREVIATIONS[name] || [...name].slice(0, 2).join("")).join("/");
  const mains = rule.mains.map((name) => PRESET_MAIN_CODES[name] || name);
  return `${sets}-${mains.join("/")}${isDiscardRule(rule, allSubs) ? "-폐기" : ""}`;
}

function presetNameByteLength(name) {
  let bytes = 0;
  for (const character of name) bytes += character.codePointAt(0) <= 0x7f ? 1 : 2;
  return bytes;
}

function presetName(rule, allSubs) {
  const fullName = presetFullName(rule, allSubs);
  const discard = isDiscardRule(rule, allSubs);
  const suffix = discard ? "-폐기" : "";
  const allSetNames = Object.keys(database.equipment[rule.kind].sets);
  const isAllSets = rule.sets.length === allSetNames.length && allSetNames.every((name) => rule.sets.includes(name));
  if (!isAllSets && presetNameByteLength(fullName) <= MAX_PRESET_NAME_BYTES) return fullName;

  const readableMains = rule.mains.map((name) => PRESET_MAIN_CODES[name] || name);
  const tinyMains = rule.mains.map((name) => PRESET_MAIN_TINY_CODES[name] || [...name][0]);
  const shortSetCodes = rule.sets.map((name) => PRESET_SET_CODES[name] || [...name][0]);
  const setCodes = isAllSets ? ["전체"] : [
    rule.sets.map((name) => SET_ABBREVIATIONS[name] || [...name].slice(0, 2).join("")).join("/"),
    shortSetCodes.join("/"),
    shortSetCodes.join(""),
  ];
  const shorteningOrder = rule.mains.map((_, index) => index)
    .filter((index) => readableMains[index] !== tinyMains[index])
    .sort((a, b) => presetNameByteLength(readableMains[b]) - presetNameByteLength(tinyMains[b]) - (presetNameByteLength(readableMains[a]) - presetNameByteLength(tinyMains[a])));
  for (const setText of [...new Set(setCodes)]) {
    const mains = [...readableMains];
    const candidate = () => `${setText}-${mains.join("/")}${suffix}`;
    if (presetNameByteLength(candidate()) <= MAX_PRESET_NAME_BYTES) return candidate();
    for (const index of shorteningOrder) {
      mains[index] = tinyMains[index];
      if (presetNameByteLength(candidate()) <= MAX_PRESET_NAME_BYTES) return candidate();
    }
  }

  const setNames = Object.keys(PRESET_SET_CODES);
  const mainNames = Object.keys(PRESET_MAIN_TINY_CODES);
  const asciiSets = isAllSets ? "ALL" : rule.sets.map((name) => String.fromCharCode(65 + Math.max(0, setNames.indexOf(name)))).join("");
  const asciiMains = rule.mains.map((name) => String.fromCharCode(97 + Math.max(0, mainNames.indexOf(name)))).join("");
  return `${asciiSets}-${asciiMains}${discard ? "-D" : ""}`;
}

async function copyPresetName(name, control) {
  const fallbackCopy = () => {
    const input = document.createElement("textarea");
    input.value = name;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("클립보드 복사를 사용할 수 없습니다.");
  };
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(name);
    } catch { fallbackCopy(); }
    const previousTitle = control.title;
    control.textContent = "복사됨";
    control.classList.add("copied");
    control.title = `복사됨 · ${presetNameByteLength(name)}/${MAX_PRESET_NAME_BYTES}바이트`;
    window.setTimeout(() => {
      if (!control.isConnected) return;
      control.textContent = "복사";
      control.classList.remove("copied");
      control.title = previousTitle;
    }, 1100);
  } catch (error) {
    control.textContent = "실패";
    control.title = error.message;
    window.setTimeout(() => {
      if (!control.isConnected) return;
      control.textContent = "복사";
    }, 1500);
  }
}

function isDiscardRule(rule, allSubs) {
  return Boolean(rule._discardPreset || rule.discardPreset) ||
    (allSubs.length > 0 && allSubs.every((name) => rule.saleOptions.includes(name)));
}

function effectivePresetPlan() {
  return currentPlan.map((rule, index) => {
    const baseMinCount = rule.minCount;
    const key = planKey(rule);
    const oldKey = legacyPlanKey(rule);
    const override = database.presetOverrides?.[key] || database.presetOverrides?.[oldKey] || {};
    const subNames = orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER);
    const discardPreset = isDiscardRule(rule, subNames) || Boolean(override.discardPreset);
    return { ...rule, ...override, _key: key, _legacyKey: oldKey, _baseMinCount: baseMinCount, _discardPreset: discardPreset, index };
  });
}

function renderPlan() {
  ensureGlobalPresetSettings();
  $("#undo").disabled = !history.length;
  for (const mode of ["include", "exclude"]) {
    const comparator = globalComparatorFor(mode);
    const comparatorButton = $(`#preset-comparator-${mode}`);
    comparatorButton.textContent = comparator === "lte" ? "\uC774\uD558" : "\uC774\uC0C1";
    comparatorButton.classList.toggle("is-gte", comparator === "gte");
    comparatorButton.classList.toggle("is-lte", comparator === "lte");
    $(`#preset-count-${mode}`).value = String(globalCountFor(mode));
  }
  const plan = effectivePresetPlan();
  const editablePlan = plan.filter((rule) => !rule._discardPreset);
  for (const control of document.querySelectorAll("[data-bulk-min-count]")) {
    const count = Number(control.dataset.bulkMinCount);
    const active = editablePlan.length > 0 && editablePlan.every((rule) => Number(rule.minCount) === count);
    control.classList.toggle("active", active);
    control.setAttribute("aria-pressed", String(active));
  }
  const weaponCount = plan.filter((rule) => rule.kind === "weapon").length;
  const armorCount = plan.length - weaponCount;
  $("#analysis-summary").textContent = `\uBB34\uAE30 ${weaponCount}\uAC1C + \uBC29\uC5B4\uAD6C ${armorCount}\uAC1C`;
  $("#plan-count").textContent = `${plan.length} / 30`;
  if (!plan.some((rule) => rule._key === selectedPresetKey)) selectedPresetKey = plan[0]?._key;
  $("#preset-plan").replaceChildren(...plan.map((rule, index) => {
    const item = document.createElement("li");
    const ruleSets = database.equipment[rule.kind].sets;
    const subNames = orderedOptions([...new Set(Object.values(ruleSets).flatMap((set) => set.subOptions))], SUB_ORDER);
    const fullName = presetFullName(rule, subNames);
    const gameName = presetName(rule, subNames);
    const label = `${String(index + 1).padStart(2, "0")} \u00B7 ${gameName}`;
    const colorClass = `${rule.kind}-${isDiscardRule(rule, subNames) ? "discard" : "partial"}`;
    const select = button(label, `preset-select ${colorClass} ${rule._key === selectedPresetKey ? "active" : ""}`, () => {
      selectedPresetKey = rule._key;
      renderPlan();
    });
    const byteCount = presetNameByteLength(gameName);
    select.title = gameName === fullName ? label : `${label}\n전체 이름: ${fullName}\n게임 입력용: ${byteCount}/${MAX_PRESET_NAME_BYTES}바이트`;
    select.setAttribute("aria-pressed", String(rule._key === selectedPresetKey));
    const copy = button("복사", `preset-copy ${colorClass}`, () => copyPresetName(gameName, copy), `${gameName} 이름 복사`);
    copy.title = `게임 입력용 이름 복사 · ${byteCount}/${MAX_PRESET_NAME_BYTES}바이트`;
    item.append(select, copy);
    return item;
  }));
  const selected = plan.find((rule) => rule._key === selectedPresetKey);
  if (selected) renderPresetDetail(selected);
}

function snapshotPresetBulkSettings() {
  return {
    beforeOverrides: JSON.parse(JSON.stringify(database.presetOverrides || {})),
    beforeComparators: JSON.parse(JSON.stringify(database.presetComparators || {})),
    beforeCounts: JSON.parse(JSON.stringify(database.presetCounts || {})),
    beforeCountCustom: JSON.parse(JSON.stringify(database.presetCountCustom || {})),
  };
}

function pushPresetBulkUndo() {
  history.push({ presetBulkSettings: snapshotPresetBulkSettings() });
  if (history.length > 50) history.shift();
}

function applyGlobalSubOptionSetting(mode) {
  database.presetOverrides ||= {};
  for (const rule of currentPlan) {
    const key = planKey(rule);
    const oldKey = legacyPlanKey(rule);
    const existing = database.presetOverrides[key] || database.presetOverrides[oldKey] || {};
    const allSubs = orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER);
    if (isDiscardRule(rule, allSubs) || existing.discardPreset || existing.allSubOptions === true) continue;
    const override = JSON.parse(JSON.stringify(existing));
    const saleOptions = new Set(override.saleOptions || rule.saleOptions);
    override.subOptionRules ||= {};
    for (const option of allSubs) {
      const fallback = defaultPresetSubOptionRule(saleOptions.has(option));
      const current = override.subOptionRules[option] || fallback;
      const currentMode = current.mode === "check" ? "include" : current.mode === "prevent" ? "exclude" : "none";
      if (currentMode !== mode) continue;
      override.subOptionRules[option] = { ...current, comparator: globalComparatorFor(mode), count: globalCountFor(mode) };
    }
    if (oldKey !== key) delete database.presetOverrides[oldKey];
    database.presetOverrides[key] = override;
  }
}

function togglePresetComparator(mode) {
  ensureGlobalPresetSettings();
  pushPresetBulkUndo();
  const beforeComparator = globalComparatorFor(mode);
  const nextComparator = beforeComparator === "gte" ? "lte" : "gte";
  database.presetComparators[mode] = nextComparator;
  if (!database.presetCountCustom[mode]) {
    database.presetCounts[mode] = defaultSubOptionRule(mode === "include", nextComparator).count;
  }
  applyGlobalSubOptionSetting(mode);
  renderPlan();
  if (sampleItems.length) renderSampleResults();
  save();
}

function setPresetCounter(mode, value) {
  ensureGlobalPresetSettings();
  const count = Math.max(0, Math.min(5, Number(value) || 0));
  pushPresetBulkUndo();
  database.presetCounts[mode] = count;
  database.presetCountCustom[mode] = true;
  applyGlobalSubOptionSetting(mode);
  renderPlan();
  if (sampleItems.length) renderSampleResults();
  save();
}

function setPresetMinCount(count) {
  database.presetOverrides ||= {};
  pushPresetBulkUndo();
  for (const rule of currentPlan) {
    const allSubs = orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER);
    if (isDiscardRule(rule, allSubs)) continue;
    const key = planKey(rule);
    const oldKey = legacyPlanKey(rule);
    const override = JSON.parse(JSON.stringify(database.presetOverrides[key] || database.presetOverrides[oldKey] || {}));
    override.minCount = count;
    if (oldKey !== key) delete database.presetOverrides[oldKey];
    database.presetOverrides[key] = override;
  }
  renderPlan();
  if (sampleItems.length) renderSampleResults();
  save();
}

$("#preset-comparator-include").addEventListener("click", () => togglePresetComparator("include"));
$("#preset-comparator-exclude").addEventListener("click", () => togglePresetComparator("exclude"));
$("#preset-count-include").addEventListener("change", (event) => setPresetCounter("include", event.currentTarget.value));
$("#preset-count-exclude").addEventListener("change", (event) => setPresetCounter("exclude", event.currentTarget.value));
document.querySelectorAll("[data-bulk-min-count]").forEach((control) => {
  control.addEventListener("click", () => setPresetMinCount(Number(control.dataset.bulkMinCount)));
});

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sampleFourOptions(options) {
  const pool = [...options];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(4, pool.length));
}

function sampleSetNames() {
  return orderedOptions([...new Set(["weapon", "armor"].flatMap((kind) => Object.keys(database.equipment[kind].sets)))], SET_ORDER);
}

function selectedSampleOptions(selection, options) {
  return selection === null ? options : options.filter((name) => selection.has(name));
}

function toggleSampleSelection(selection, name, options) {
  if (name === "모두") return null;
  const next = selection === null ? new Set([name]) : new Set(selection);
  if (selection !== null) {
    if (next.has(name)) next.delete(name);
    else next.add(name);
  }
  return next.size === 0 || next.size === options.length ? null : next;
}

function generateSampleEquipment() {
  sampleItems = ["weapon", "armor"].flatMap((kind) => {
    const availableSets = sampleSetNames().filter((name) => database.equipment[kind].sets[name]);
    const sets = selectedSampleOptions(sampleSetSelection, availableSets);
    const mains = selectedSampleOptions(sampleMainSelections[kind], SAMPLE_MAIN_OPTIONS[kind]);
    const pool = sets.flatMap((name) => mains.map((main) => ({ name, set: database.equipment[kind].sets[name], main })));
    if (!pool.length) return [];
    return Array.from({ length: 50 }, (_, index) => {
      const { name: setName, set, main } = randomItem(pool);
      const options = orderedOptions(sampleFourOptions(set.subOptions), SUB_ORDER);
      const counts = Object.fromEntries(options.map((name) => [name, 0]));
      const enhancementRolls = sampleEnhancementLevel === 15 ? 5 : 0;
      for (let roll = 0; roll < enhancementRolls; roll++) counts[randomItem(options)]++;
      return { index, kind, setName, main, options, counts };
    });
  });
  sampleHasGenerated = true;
  sampleFilterOptionsDirty = false;
  updateSamplePickerSummaries();
  renderSampleResults();
}

function updateSamplePickerSummaries() {
  if (!database) return;
  const sets = sampleSetNames();
  const chosenSets = selectedSampleOptions(sampleSetSelection, sets);
  $("#sample-set-summary").textContent = sampleSetSelection === null ? "모두" : chosenSets.length === 1 ? chosenSets[0] : `${chosenSets.length}개 선택`;
  const mainLabel = (kind) => sampleMainSelections[kind] === null ? "모두" : `${sampleMainSelections[kind].size}개`;
  $("#sample-main-summary").textContent = sampleMainSelections.weapon === null && sampleMainSelections.armor === null
    ? "모두"
    : `무기 ${mainLabel("weapon")} · 방어구 ${mainLabel("armor")}`;
  $("#reroll-sample").textContent = sampleFilterOptionsDirty ? "선택 조건으로 뽑기" : "다시 뽑기";
  $("#sample-filter-hint").textContent = sampleFilterOptionsDirty
    ? "조건을 바꿨어요. 선택 조건으로 뽑기를 눌러 적용하세요."
    : "조건을 고른 뒤 다시 뽑기를 누르세요.";
}

function sampleMenuChoice(category, kind, name, selected) {
  const choice = document.createElement("button");
  choice.type = "button";
  choice.className = `choice sample-choice${selected ? " selected" : ""}`;
  choice.dataset.sampleCategory = category;
  if (kind) choice.dataset.sampleKind = kind;
  choice.dataset.sampleOption = name;
  choice.setAttribute("aria-pressed", String(selected));
  choice.setAttribute("aria-label", name === "모두" ? "모두 선택" : `${OPTION_LABELS[name] || name} 선택`);
  if (name !== "모두") {
    const icon = category === "sets" ? makeSetIcon(name) : makeSampleIcon(name, "sample-menu-icon");
    if (icon) {
      icon.classList.add("sample-choice-icon");
      choice.append(icon);
    }
  }
  const label = document.createElement("span");
  label.textContent = name === "모두" ? "모두" : OPTION_LABELS[name] || name;
  choice.append(label);
  return choice;
}

function addSampleMenuGroup(panel, title, category, kind, options, selection) {
  const section = document.createElement("section");
  section.className = "sample-menu-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "choices sample-choice-grid";
  grid.append(sampleMenuChoice(category, kind, "모두", selection === null));
  for (const name of options) grid.append(sampleMenuChoice(category, kind, name, selection?.has(name) || false));
  section.append(heading, grid);
  panel.append(section);
}

function positionSampleFilterMenu() {
  const panel = $("#sample-filter-popover");
  if (panel.hidden || !sampleMenuOpener) return;
  const anchor = sampleMenuOpener.getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  const margin = 10;
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - bounds.width - margin));
  const below = window.innerHeight - anchor.bottom - margin;
  const top = bounds.height <= below || anchor.top < bounds.height + margin ? anchor.bottom + 6 : anchor.top - bounds.height - 6;
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - bounds.height - margin))}px`;
}

function renderSampleFilterMenu(name) {
  const panel = $("#sample-filter-popover");
  const scrollTop = panel.scrollTop;
  panel.replaceChildren();
  panel.dataset.menu = name;
  const header = document.createElement("div");
  header.className = "sample-menu-header";
  const title = document.createElement("h2");
  title.textContent = name === "sets" ? "세트 선택" : "주옵션 선택";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sample-menu-close";
  close.textContent = "닫기";
  close.addEventListener("click", () => closeSampleFilterMenu(true));
  header.append(title, close);
  panel.append(header);
  if (name === "sets") {
    addSampleMenuGroup(panel, "세트", "sets", null, sampleSetNames(), sampleSetSelection);
  } else {
    for (const kind of ["weapon", "armor"]) {
      addSampleMenuGroup(panel, kind === "weapon" ? "무기 주옵션" : "방어구 주옵션", "mains", kind, SAMPLE_MAIN_OPTIONS[kind], sampleMainSelections[kind]);
    }
  }
  panel.hidden = false;
  panel.scrollTop = scrollTop;
  sampleMenuOpener?.setAttribute("aria-expanded", "true");
  positionSampleFilterMenu();
}

function openSampleFilterMenu(name, opener) {
  if (sampleMenuName === name && !$("#sample-filter-popover").hidden) {
    closeSampleFilterMenu();
    return;
  }
  if (sampleMenuOpener) sampleMenuOpener.setAttribute("aria-expanded", "false");
  sampleMenuName = name;
  sampleMenuOpener = opener;
  renderSampleFilterMenu(name);
}

function closeSampleFilterMenu(restoreFocus = false) {
  const panel = $("#sample-filter-popover");
  panel.hidden = true;
  panel.removeAttribute("data-menu");
  sampleMenuOpener?.setAttribute("aria-expanded", "false");
  const opener = sampleMenuOpener;
  sampleMenuName = null;
  sampleMenuOpener = null;
  if (restoreFocus) opener?.focus();
}

function resetSampleFilters() {
  sampleSetSelection = null;
  sampleMainSelections = { weapon: null, armor: null };
  sampleFilter = "all";
  sampleFilterOptionsDirty = false;
  applySampleFilter();
  updateSamplePickerSummaries();
  closeSampleFilterMenu();
  generateSampleEquipment();
}

function setSampleEnhancementLevel(level) {
  sampleEnhancementLevel = Number(level) === 15 ? 15 : 0;
  document.querySelectorAll("[data-sample-enhancement]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.sampleEnhancement) === sampleEnhancementLevel));
  });
  $("#sample-note").textContent = sampleEnhancementLevel === 15
    ? "6성 기본 부옵 수치로 표시합니다. 15강은 부옵 4종 중 무작위로 5회 강화하며, 매 강화마다 해당 기본값만큼 더해 판매 판정에 반영합니다."
    : "6성 기본 부옵 수치로 표시합니다. 노강은 부옵 강화가 없으며, 실제 등장 확률을 뜻하지 않습니다.";
  generateSampleEquipment();
}

function makeSampleIcon(name, className = "stat-icon") {
  const icon = document.createElement("img");
  icon.className = className;
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  icon.src = `/icons/stat-${OPTION_ICON_KEYS[name] || "shield"}.png`;
  return icon;
}

function makeSetIcon(name) {
  const index = SET_ORDER.indexOf(name);
  if (index < 0) return null;
  const icon = document.createElement("img");
  icon.className = "sample-set-icon";
  icon.alt = "";
  icon.dataset.setName = name;
  icon.setAttribute("aria-hidden", "true");
  icon.src = `/icons/set-${index}.png`;
  return icon;
}

function thresholdMatches(value, setting) {
  return setting.comparator === "lte" ? value <= setting.count : value >= setting.count;
}

function sampleMatchesPreset(item, rule) {
  if (rule.kind !== item.kind || !rule.sets.includes(item.setName) || !rule.mains.includes(item.main)) return false;
  if (rule.allSubOptions === true) return true;
  const allSubs = orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER);
  const settings = rule.subOptionRules || {};
  const optionRules = allSubs.map((name) => ({
    name,
    setting: settings[name] || defaultPresetSubOptionRule(rule.saleOptions.includes(name)),
    count: item.counts[name] || 0,
    present: item.options.includes(name),
  }));
  if (optionRules.some(({ setting, count, present }) => present && setting.mode === "prevent" && thresholdMatches(count, setting))) return false;
  const included = optionRules.filter(({ setting }) => setting.mode === "check");
  if (!included.length) return Boolean(rule._discardPreset);
  const met = included.filter(({ setting, count, present }) => present && thresholdMatches(count, setting)).length;
  // A sale requires at least the configured number of matching included sub-options.
  return met >= Math.max(1, Number(rule.minCount) || 1);
}

function renderSampleResults() {
  if (!sampleHasGenerated || !database) return;
  const plan = effectivePresetPlan();
  const cardsByKind = { weapon: [], armor: [] };
  const soldByKind = { weapon: 0, armor: 0 };
  for (const item of sampleItems) {
    const matches = plan.filter((rule) => sampleMatchesPreset(item, rule));
    if (matches.length) soldByKind[item.kind]++;
    const card = document.createElement("article");
    card.className = `sample-gear-card ${matches.length ? "sample-sold" : "sample-kept"}`;
    card.dataset.result = matches.length ? "sold" : "kept";
    const content = document.createElement("div");
    content.className = "sample-gear-content";
    const heading = document.createElement("div");
    heading.className = "sample-gear-heading";
    const number = document.createElement("span");
    number.className = "sample-gear-number";
    number.textContent = String(item.index + 1).padStart(3, "0");
    const title = document.createElement("strong");
    title.textContent = item.setName;
    const result = document.createElement("span");
    result.className = "sample-result-badge";
    result.textContent = matches.length ? "\ud310\ub9e4" : "\ubcf4\uc874";
    heading.append(number);
    const setIcon = makeSetIcon(item.setName);
    if (setIcon) heading.append(setIcon);
    heading.append(title, result);
    const main = document.createElement("div");
    main.className = "sample-gear-main";
    main.append(makeSampleIcon(item.main, "stat-icon main-stat-icon"), document.createTextNode(OPTION_LABELS[item.main] || item.main));
    const subList = document.createElement("div");
    subList.className = "sample-sub-options";
    for (const name of item.options) {
      const sub = document.createElement("div");
      sub.className = "sample-sub-option";
      const label = document.createElement("span");
      label.className = "sample-sub-label";
      const labelText = document.createElement("span");
      labelText.textContent = OPTION_LABELS[name] || name;
      label.append(makeSampleIcon(name), labelText);
      sub.append(label);
      const upgrades = item.counts[name] || 0;
      const baseValue = SAMPLE_SUBSTAT_VALUES[name];
      const percent = SAMPLE_PERCENT_SUBSTATS.has(name);
      const value = document.createElement("span");
      value.className = "sample-sub-value";
      value.textContent = `${(baseValue * (upgrades + 1)).toLocaleString("ko-KR")}${percent ? "%" : ""}`;
      value.title = `6성 기본 ${baseValue}${percent ? "%" : ""}${upgrades ? ` · 강화 ${upgrades}회` : ""}`;
      sub.append(value);
      const mark = document.createElement("span");
      mark.className = "sample-sub-enhancements";
      if (upgrades) {
        mark.textContent = `▲${upgrades}`;
        mark.setAttribute("aria-label", `강화 ${upgrades}회`);
      } else {
        mark.setAttribute("aria-hidden", "true");
      }
      sub.append(mark);
      subList.append(sub);
    }
    content.append(heading, main, subList);
    card.append(content);
    if (matches.length) {
      const hit = document.createElement("p");
      hit.className = "sample-preset-hit";
      hit.textContent = `\uc801\uc911 \ud504\ub9ac\uc14b ${matches.map((rule) => String(rule.index + 1).padStart(2, "0")).join(", ")}`;
      hit.title = matches.map((rule) => `${String(rule.index + 1).padStart(2, "0")} \u00b7 ${presetName(rule, orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER))}`).join("\n");
      card.append(hit);
    }
    cardsByKind[item.kind].push(card);
  }

  const groups = ["weapon", "armor"].map((kind) => {
    const group = document.createElement("section");
    group.className = `sample-kind-group ${kind}`;
    const header = document.createElement("div");
    header.className = "sample-kind-header";
    const title = document.createElement("h3");
    title.textContent = kind === "weapon" ? "\ubb34\uae30" : "\ubc29\uc5b4\uad6c";
    const count = document.createElement("span");
    count.className = "sample-kind-count";
    const total = cardsByKind[kind].length;
    count.textContent = `${total}\uac1c \u00b7 \ud310\ub9e4 ${soldByKind[kind]} \u00b7 \ubcf4\uc874 ${total - soldByKind[kind]}`;
    header.append(title, count);
    const grid = document.createElement("div");
    grid.className = "sample-kind-grid";
    grid.replaceChildren(...cardsByKind[kind]);
    if (!total) {
      const empty = document.createElement("p");
      empty.className = "sample-empty";
      empty.textContent = "선택 조건에 맞는 장비가 없습니다.";
      grid.append(empty);
    }
    group.append(header, grid);
    return group;
  });
  $("#sample-results").replaceChildren(...groups);
  applySampleFilter();
  syncSampleGridColumns();
  if (!sampleGridResizeObserver && "ResizeObserver" in window) {
    sampleGridResizeObserver = new ResizeObserver(syncSampleGridColumns);
    sampleGridResizeObserver.observe($("#sample-view"));
  }
  const sold = soldByKind.weapon + soldByKind.armor;
  const weaponTotal = cardsByKind.weapon.length;
  const armorTotal = cardsByKind.armor.length;
  const total = weaponTotal + armorTotal;
  $("#sample-summary").textContent = `\ubb34\uae30 ${soldByKind.weapon}/${weaponTotal} \ud310\ub9e4 \u00b7 \ubc29\uc5b4\uad6c ${soldByKind.armor}/${armorTotal} \ud310\ub9e4 \u00b7 \uc804\uccb4 \ubcf4\uc874 ${total - sold}/${total}`;
}

function applySampleFilter() {
  document.querySelectorAll("[data-sample-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.sampleFilter === sampleFilter));
  });
  document.querySelectorAll(".sample-gear-card").forEach((card) => {
    card.hidden = sampleFilter !== "all" && card.dataset.result !== sampleFilter;
  });
}

function sampleSelectionKey(selection) {
  return selection === null ? "*" : [...selection].sort().join("\u0000");
}

function syncSampleGridColumns() {
  const view = $("#sample-view");
  const results = $("#sample-results");
  const firstCard = results?.querySelector(".sample-gear-card");
  if (!view || view.hidden || !firstCard) return;
  const style = getComputedStyle(results);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const available = results.clientWidth - padding;
  if (!sampleCardMinWidth) {
    sampleCardMinWidth = (available - 3 * gap) / 4;
    if (sampleCardMinWidth <= 0) return;
    results.style.setProperty("--sample-card-min", `${sampleCardMinWidth}px`);
  }
  const columns = Math.max(1, Math.min(4, Math.floor((available + gap) / (sampleCardMinWidth + gap))));
  results.dataset.columns = String(columns);
}

function showLeftView(view) {
  document.querySelectorAll(".left-tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.leftView === view)));
  $("#left-matrix-view").hidden = view !== "matrix";
  $("#sample-view").hidden = view !== "sample";
  if (view === "sample") {
    if (!sampleHasGenerated) generateSampleEquipment();
    else renderSampleResults();
  }
}

document.querySelectorAll(".left-tab").forEach((tab) => {
  tab.addEventListener("click", () => showLeftView(tab.dataset.leftView));
});
$("#reroll-sample").addEventListener("click", generateSampleEquipment);
document.querySelectorAll("[data-sample-enhancement]").forEach((button) => {
  button.addEventListener("click", () => setSampleEnhancementLevel(button.dataset.sampleEnhancement));
});
document.querySelectorAll(".sample-picker-toggle").forEach((button) => {
  button.addEventListener("click", () => openSampleFilterMenu(button.dataset.sampleMenu, button));
});
$("#reset-sample-filters").addEventListener("click", resetSampleFilters);
$("#sample-filter-popover").addEventListener("click", (event) => {
  const choice = event.target.closest(".sample-choice");
  if (!choice) return;
  const { sampleCategory: category, sampleKind: kind, sampleOption: name } = choice.dataset;
  if (category === "sets") {
    const before = sampleSelectionKey(sampleSetSelection);
    sampleSetSelection = toggleSampleSelection(sampleSetSelection, name, sampleSetNames());
    if (before !== sampleSelectionKey(sampleSetSelection)) sampleFilterOptionsDirty = true;
  } else {
    const before = sampleSelectionKey(sampleMainSelections[kind]);
    sampleMainSelections[kind] = toggleSampleSelection(sampleMainSelections[kind], name, SAMPLE_MAIN_OPTIONS[kind]);
    if (before !== sampleSelectionKey(sampleMainSelections[kind])) sampleFilterOptionsDirty = true;
  }
  updateSamplePickerSummaries();
  const menuName = sampleMenuName;
  renderSampleFilterMenu(menuName);
  [...$("#sample-filter-popover").querySelectorAll(".sample-choice")].find((item) =>
    item.dataset.sampleCategory === category && (item.dataset.sampleKind || "") === (kind || "") && item.dataset.sampleOption === name
  )?.focus({ preventScroll: true });
});
document.querySelectorAll("[data-sample-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    sampleFilter = button.dataset.sampleFilter;
    applySampleFilter();
  });
});
document.addEventListener("pointerdown", (event) => {
  if ($("#sample-filter-popover").hidden) return;
  if (event.target.closest("#sample-filter-popover, .sample-picker-toggle")) return;
  closeSampleFilterMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#sample-filter-popover").hidden) closeSampleFilterMenu(true);
});
window.addEventListener("resize", positionSampleFilterMenu);
window.addEventListener("scroll", positionSampleFilterMenu, true);

function generatePresets() {
  currentPlan = buildPresetPlan();
  initializeGeneratedPresetComparators();
  planStale = false;
  renderPlan();
  renderRecommendations();
  updateGenerationStatus();
  if (sampleItems.length) renderSampleResults();
}

function initializeGeneratedPresetComparators() {
  ensureGlobalPresetSettings();
  database.presetOverrides ||= {};
  const speed = "\uC18D\uACF5";
  for (const rule of currentPlan) {
    const key = planKey(rule);
    const override = database.presetOverrides[key] || {};
    const allSubs = orderedOptions([...new Set(Object.values(database.equipment[rule.kind].sets).flatMap((set) => set.subOptions))], SUB_ORDER);
    const discardPreset = isDiscardRule(rule, allSubs) || Boolean(override.discardPreset);
    if (discardPreset && !override.discardPreset) {
      override.discardPreset = true;
      override.allSubOptions = false;
      override.saleOptions = allSubs.filter((option) => option !== speed);
      override.subOptionRules = Object.fromEntries(allSubs.map((option) => [option, option === speed
        ? { mode: "prevent", comparator: "gte", count: 3 }
        : { mode: "none", comparator: "gte", count: 0 }]));
    } else {
      const saleOptions = new Set(override.saleOptions || rule.saleOptions);
      override.subOptionRules ||= {};
      for (const option of allSubs) {
        if (!override.subOptionRules[option]) override.subOptionRules[option] = defaultPresetSubOptionRule(saleOptions.has(option));
      }
    }
    database.presetOverrides[key] = override;
  }
  save();
}

function migratePresetRuleSemantics() {
  const version = database.presetRuleVersion || 0;
  if (version >= 4) return;
  const legacyComparator = database.presetComparator || "gte";
  database.presetComparators ||= { include: legacyComparator, exclude: legacyComparator };
  for (const override of Object.values(database.presetOverrides || {})) {
    for (const setting of Object.values(override.subOptionRules || {})) {
      const comparator = setting.comparator || legacyComparator;
      const included = setting.mode === "check";
      const oldCount = version < 2
        ? (comparator === "lte" ? (included ? 5 : 4) : (included ? 0 : 2))
        : (comparator === "lte" ? (included ? 4 : 5) : (included ? 2 : 0));
      const staleExcludeLteDefault = !included && comparator === "lte" && setting.count === 3;
      if (setting.count === oldCount || staleExcludeLteDefault) {
        setting.count = defaultSubOptionRule(included, comparator).count;
      }
    }
  }
  database.presetRuleVersion = 4;
  delete database.presetComparator;
}

function renderPresetDetail(rule) {
  const index = rule.index;
  const detail = $("#detail-content");
  const groups = [];
  const sets = database.equipment[rule.kind].sets;
  const allSets = orderedOptions(Object.keys(sets), SET_ORDER);
  const mainOrder = rule.kind === "armor" ? ARMOR_MAIN_ORDER : MAIN_ORDER;
  const allMains = orderedOptions([...new Set([...Object.values(sets).flatMap((set) => set.mainOptions), "모든 공격력(고정)", "방어력(고정)", "생명력(고정)"])], mainOrder);
  const allSubs = orderedOptions([...new Set(Object.values(sets).flatMap((set) => set.subOptions))], SUB_ORDER);
  const title = `${String(index + 1).padStart(2, "0")} · ${presetName(rule, allSubs)}`;
  $("#detail-title").textContent = `${title} · ${rule.kind === "weapon" ? "무기" : "방어구"}`;
  const part = optionGroup("부위", ["무기", "방어구", "장신구"], new Set([rule.kind === "weapon" ? "무기" : "방어구"]));
  groups.push(part);
  const setGroup = optionGroup("세트", ["모두", ...allSets], onlyAllChecked(allSets, new Set(rule.sets)));
  setGroup.classList.add("set-grid-group");
  groups.push(setGroup);
  groups.push(optionGroup("메인 옵션", ["모두", ...allMains], onlyAllChecked(allMains, new Set(rule.mains))));
  groups.push(renderSubOptionGroup(allSubs, rule));
  detail.replaceChildren(...groups);
}

function setupSplitters() {
  const workspace = $("#app");
  const left = $(".left-pane");
  const middle = $("#analysis");
  const right = $("#preset-detail");
  const leftMin = 320;
  const middleMin = 180;
  const rightMin = 420;
  function applyLayout(leftWidth, middleWidth) {
    const available = workspace.clientWidth - 12;
    leftWidth = Math.max(leftMin, Math.min(available - middleMin - rightMin, leftWidth));
    middleWidth = Math.max(middleMin, Math.min(available - leftWidth - rightMin, middleWidth));
    workspace.style.gridTemplateColumns = `${leftWidth}px 6px ${middleWidth}px 6px minmax(${rightMin}px, 1fr)`;
  }
  function restoreLayout() {
    const layout = database.layout;
    if (!layout || !Number.isFinite(layout.leftRatio) || !Number.isFinite(layout.middleRatio)) return;
    const available = workspace.clientWidth - 12;
    applyLayout(available * layout.leftRatio, available * layout.middleRatio);
  }
  function persistLayout() {
    const available = workspace.clientWidth - 12;
    database.layout = { ...database.layout, leftRatio: left.offsetWidth / available, middleRatio: middle.offsetWidth / available };
    save();
  }
  restoreLayout();
  if (!database.layout || !Number.isFinite(database.layout.leftRatio) || !Number.isFinite(database.layout.middleRatio)) persistLayout();
  window.addEventListener("resize", restoreLayout);
  for (const splitter of document.querySelectorAll(".splitter")) {
    splitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startLeft = left.offsetWidth;
      const startMiddle = middle.offsetWidth;
      const startRight = right.offsetWidth;
      const move = (nextEvent) => {
        const available = workspace.clientWidth - 12;
        const delta = nextEvent.clientX - startX;
        let leftWidth = startLeft;
        let middleWidth = startMiddle;
        if (splitter.dataset.split === "left") {
          leftWidth = Math.max(leftMin, Math.min(available - middleMin - startRight, startLeft + delta));
          middleWidth = available - startRight - leftWidth;
        } else {
          middleWidth = Math.max(middleMin, Math.min(available - startLeft - rightMin, startMiddle + delta));
        }
        applyLayout(leftWidth, middleWidth);
        splitter.setAttribute("aria-valuenow", String(splitter.dataset.split === "left" ? leftWidth : middleWidth));
      };
      const stop = () => {
        persistLayout();
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", stop);
        splitter.removeEventListener("lostpointercapture", stop);
      };
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", stop);
      splitter.addEventListener("lostpointercapture", stop);
    });
  }

  const recommendations = $("#recommendations");
  const inventory = $("#inventory-share-panel");
  const presetPlan = $("#preset-plan");
  const header = $(".plan-header");
  const bulkSettings = $("#preset-bulk-controls");
  const verticalSplitters = [...document.querySelectorAll(".v-splitter")];
  const verticalPanes = [recommendations, inventory, presetPlan];
  const minHeights = [90, 120, 100];
  function usableHeight() {
    return Math.max(0, middle.clientHeight - header.offsetHeight - bulkSettings.offsetHeight - verticalSplitters.reduce((sum, item) => sum + item.offsetHeight, 0));
  }
  function applyVertical(recHeight, inventoryHeight) {
    const total = usableHeight();
    recHeight = Math.max(minHeights[0], Math.min(total - minHeights[1] - minHeights[2], recHeight));
    inventoryHeight = Math.max(minHeights[1], Math.min(total - recHeight - minHeights[2], inventoryHeight));
    const planHeight = Math.max(minHeights[2], total - recHeight - inventoryHeight);
    [recHeight, inventoryHeight, planHeight].forEach((height, index) => {
      verticalPanes[index].style.flex = `0 0 ${height}px`;
    });
  }
  function saveVerticalLayout() {
    const total = usableHeight();
    if (!total) return;
    database.layout = {
      ...database.layout,
      recommendationsRatio: recommendations.offsetHeight / total,
      inventoryRatio: inventory.offsetHeight / total,
    };
    save();
  }
  function restoreVerticalLayout() {
    const total = usableHeight();
    const layout = database.layout || {};
    const recRatio = Number.isFinite(layout.recommendationsRatio) ? layout.recommendationsRatio : 0.34;
    const inventoryRatio = Number.isFinite(layout.inventoryRatio) ? layout.inventoryRatio : 0.31;
    applyVertical(total * recRatio, total * inventoryRatio);
  }
  restoreVerticalLayout();
  if (!Number.isFinite(database.layout?.recommendationsRatio) || !Number.isFinite(database.layout?.inventoryRatio)) saveVerticalLayout();
  window.addEventListener("resize", restoreVerticalLayout);
  verticalSplitters.forEach((splitter) => {
    splitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startRec = recommendations.offsetHeight;
      const startInventory = inventory.offsetHeight;
      const startPlan = presetPlan.offsetHeight;
      const move = (nextEvent) => {
        const delta = nextEvent.clientY - startY;
        let recHeight = startRec;
        let inventoryHeight = startInventory;
        if (splitter.dataset.vsplit === "recommendations") {
          const adjusted = Math.max(minHeights[0], Math.min(startRec + startInventory - minHeights[1], startRec + delta));
          recHeight = adjusted;
          inventoryHeight = startRec + startInventory - adjusted;
        } else {
          const adjusted = Math.max(minHeights[1], Math.min(startInventory + startPlan - minHeights[2], startInventory + delta));
          inventoryHeight = adjusted;
        }
        applyVertical(recHeight, inventoryHeight);
        splitter.setAttribute("aria-valuenow", String(splitter.dataset.vsplit === "recommendations" ? recHeight : inventoryHeight));
      };
      const stop = () => {
        saveVerticalLayout();
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", stop);
        splitter.removeEventListener("lostpointercapture", stop);
      };
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", stop);
      splitter.addEventListener("lostpointercapture", stop);
    });
  });
}

$("#generate").addEventListener("click", generatePresets);
(async () => {
  try {
    const response = await fetch("/api/presets");
    if (!response.ok) throw new Error("로컬 DB를 불러오지 못했습니다.");
    database = await response.json();
    if (!valid(database)) throw new Error("데이터 형식이 올바르지 않습니다.");
    migratePresetRuleSemantics();
    updateSamplePickerSummaries();
    $("#status").textContent = "presets.json 불러옴";
    $("#app").hidden = false;
    render();
    generatePresets();
    setupSplitters();
  } catch (error) { $("#error").textContent = error.message; $("#error").hidden = false; }
})();
