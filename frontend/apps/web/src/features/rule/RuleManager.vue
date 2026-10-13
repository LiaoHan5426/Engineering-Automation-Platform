<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  runtimeApi,
  type DryRunResult,
  type RuleCondition,
  type RuleDefinition,
  type RuleFact,
  type RulePackManifest,
  type RulePackSummary,
  type RuleRequirements,
  type RuleValidation,
} from "@eap/runtime-client";
import { ConfirmBox, EmptyState, Feedback, Button, Badge } from "@eap/ui";
import { errorMessage } from "../../lib/presentation";
import { derivedCapabilities, requirementGaps, unknownFacts } from "./ruleDraft";

const emit = defineEmits<{ saved: [] }>();

const packs = ref<RulePackSummary[]>([]);
const facts = ref<RuleFact[]>([]);
const operators = ref<string[]>([]);
const selectedId = ref("");
/** The edited manifest. For a shipped pack this is a read-only copy of it. */
const draft = ref<RulePackManifest | null>(null);
/** The manifest as loaded, formatted the same way `draftText` is, so `dirty` compares like with like. */
const baseline = ref("");
const shipped = ref(false);
const requirements = ref<RuleRequirements | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const message = ref("");
const validation = ref<RuleValidation | null>(null);

const newPackOpen = ref(false);
const newPackId = ref("");
const newPackFromBlank = ref(true);
const advancedOpen = ref(false);
const advancedText = ref("");
const deleteOpen = ref(false);
const deleteRefusal = ref("");

const drySql = ref("");
const dryBusy = ref(false);
const dryError = ref("");
const dry = ref<DryRunResult | null>(null);

const rules = computed<RuleDefinition[]>(() => draft.value?.rules ?? []);
const selectedPack = computed(() => packs.value.find((pack) => pack.id === selectedId.value));
const draftText = computed(() => (draft.value ? JSON.stringify(draft.value, null, 2) : ""));
const dirty = computed(() => !!draft.value && !shipped.value && draftText.value !== baseline.value);
const matchedFacts = computed(() => Object.entries(dry.value?.facts ?? {}));
const draftDerived = computed(() =>
  draft.value ? derivedCapabilities(draft.value, facts.value) : [],
);

/** Facts grouped by the capability that publishes them — the axis requirements are derived from. */
const factsByProducer = computed(() => {
  const groups = new Map<string, RuleFact[]>();
  for (const fact of facts.value) {
    const list = groups.get(fact.producedBy) ?? [];
    list.push(fact);
    groups.set(fact.producedBy, list);
  }
  return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
});
const declaredRequirementMismatch = computed(() => {
  const declared = [...(requirements.value?.declared ?? [])].sort();
  const derived = [...(requirements.value?.derived ?? [])].sort();
  return derived.filter((capability) => !declared.includes(capability));
});

/**
 * The same checks the backend applies, run locally so a bad edit is refused at the field.
 *
 * `校验` still calls the backend — this is the early half, not a replacement. A save-then-reject cycle on
 * every keystroke teaches the author nothing, and a round trip cannot name which rule is at fault.
 */
const localProblems = computed(() => {
  const manifest = draft.value;
  if (!manifest) return [];
  const problems: string[] = [];
  const unknown = unknownFacts(manifest, facts.value);
  if (unknown.length)
    problems.push(
      `引用了词表之外的事实：${unknown.join("、")}。引用未知事实的规则永远不会命中，保存会被拒绝。`,
    );
  const gaps = requirementGaps(manifest, facts.value);
  if (gaps.length)
    problems.push(`requires.capabilities 未覆盖规则实际依赖的能力：${gaps.join("、")}。`);
  if (!manifest.id?.trim()) problems.push("规则包缺少 id。");
  if (!manifest.name?.trim()) problems.push("规则包缺少名称。");
  if (!rules.value.length) problems.push("规则包至少需要一条规则。");
  return problems;
});
const canEdit = computed(() => !!draft.value && !shipped.value);

const severityOptions = ["critical", "high", "medium", "low", "info"];
const operatorText: Record<string, string> = {
  eq: "等于",
  ne: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  in: "属于",
  contains: "包含",
  exists: "存在",
  absent: "不存在",
  matches: "匹配正则",
};
const severityLabel: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  info: "提示",
};

function severityText(value?: string) {
  return value ? (severityLabel[value] ?? value) : "—";
}
function literal(value: unknown) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return `"${value}"`;
  return JSON.stringify(value);
}
function conditionText(condition?: RuleCondition): string {
  if (!condition) return "总是命中";
  if (condition.all?.length) return condition.all.map(conditionText).join(" 且 ");
  if (condition.any?.length) return condition.any.map(conditionText).join(" 或 ");
  if (condition.not) return `非（${conditionText(condition.not)}）`;
  if (!condition.fact) return "未定义条件";
  const op = condition.op ?? "eq";
  return `${condition.fact} ${operatorText[op] ?? op} ${literal(condition.value)}`;
}
function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}
/**
 * Template-safe accessors for a condition.
 *
 * `rule.when!.fact` cannot be written in a template — templates are compiled to plain JavaScript, so a
 * non-null assertion is a syntax error there. Reading through a function also keeps the read-only guard
 * honest: a shipped pack's condition is never assigned.
 */
const eventValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;
function isLeaf(condition?: RuleCondition) {
  return (
    !!condition &&
    !condition.all?.length &&
    !condition.any?.length &&
    !condition.not &&
    !!condition.fact
  );
}
function isCompound(condition?: RuleCondition) {
  return !!condition && (!!condition.all?.length || !!condition.any?.length || !!condition.not);
}
function conditionFact(rule: RuleDefinition) {
  return rule.when?.fact ?? "";
}
function conditionOp(rule: RuleDefinition) {
  return rule.when?.op ?? "eq";
}
function conditionValue(rule: RuleDefinition) {
  const value = rule.when?.value;
  return value === undefined || value === null ? "" : String(value);
}
function setConditionFact(rule: RuleDefinition, value: string) {
  if (rule.when && canEdit.value) rule.when.fact = value;
}
function setConditionOp(rule: RuleDefinition, value: string) {
  if (rule.when && canEdit.value) rule.when.op = value;
}
function setConditionValue(rule: RuleDefinition, value: string) {
  if (rule.when && canEdit.value) rule.when.value = value;
}
function resetCondition(rule: RuleDefinition) {
  if (!canEdit.value) return;
  rule.when = { fact: facts.value[0]?.key ?? "", op: "eq", value: true };
}
function producerOf(factKey: string) {
  return facts.value.find((fact) => fact.key === factKey)?.producedBy ?? "—";
}

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const [catalog, vocabulary] = await Promise.all([
      runtimeApi.rulePacks(),
      runtimeApi.ruleVocabulary(),
    ]);
    packs.value = catalog.items;
    facts.value = vocabulary.facts;
    operators.value = vocabulary.operators;
    const keep = packs.value.some((pack) => pack.id === selectedId.value);
    await selectPack(keep ? selectedId.value : (packs.value[0]?.id ?? ""));
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function selectPack(id: string) {
  if (!id) {
    selectedId.value = "";
    draft.value = null;
    baseline.value = "";
    shipped.value = false;
    requirements.value = null;
    return;
  }
  selectedId.value = id;
  error.value = "";
  validation.value = null;
  dry.value = null;
  dryError.value = "";
  advancedOpen.value = false;
  deleteOpen.value = false;
  deleteRefusal.value = "";
  try {
    const detail = await runtimeApi.rulePack(id);
    const manifest = JSON.parse(detail.manifest) as RulePackManifest;
    draft.value = manifest;
    baseline.value = JSON.stringify(manifest, null, 2);
    shipped.value = detail.shipped;
    requirements.value = detail.requirements ?? null;
  } catch (cause) {
    draft.value = null;
    baseline.value = "";
    requirements.value = null;
    error.value = errorMessage(cause);
  }
}

/**
 * 校验：先跑本地镜像，再让后端复核。
 *
 * 两边都跑不是冗余：本地那半能指出是哪一条规则、哪一个事实；后端那半是唯一有权的判定，
 * 而且它还会检查浏览器看不到的东西（保留标识、跨表引用）。二者不一致时以后端为准。
 */
async function validateDraft() {
  if (!draft.value || busy.value) return;
  if (!canEdit.value) {
    message.value =
      "内置规则包是只读的：请先「复制为自定义」，在副本上改。就地修改会在下次升级时被静默覆盖。";
    return;
  }
  if (localProblems.value.length) {
    message.value = localProblems.value.join("；");
    validation.value = null;
    return;
  }
  busy.value = true;
  message.value = "";
  try {
    validation.value = await runtimeApi.validateRulePack(draftText.value);
    message.value = validation.value.valid
      ? "定义校验通过（本地镜像与后端一致）。"
      : (validation.value.errors ?? []).join("；");
  } catch (cause) {
    message.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

async function saveDraft() {
  if (!draft.value || !selectedId.value || busy.value) return;
  if (!canEdit.value) {
    message.value = "内置规则包不可就地修改：请先复制为自定义。";
    return;
  }
  if (localProblems.value.length) {
    message.value = localProblems.value.join("；");
    return;
  }
  busy.value = true;
  message.value = "";
  try {
    const result = await runtimeApi.updateRulePack(
      selectedId.value,
      draft.value.name,
      draftText.value,
    );
    message.value = `已保存，revision 现在是 ${result.revision ?? "?"}。这个数字每次保存都会自增，就是「规则是数据」的证据。`;
    await refresh();
    emit("saved");
  } catch (cause) {
    message.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

function discardDraft() {
  if (!draft.value) return;
  draft.value = JSON.parse(baseline.value) as RulePackManifest;
  message.value = "已放弃未保存的修改，回到上次保存的版本。";
}

function addRule() {
  if (!draft.value || !canEdit.value) return;
  if (!draft.value.rules) draft.value.rules = [];
  let index = draft.value.rules.length + 1;
  while (draft.value.rules.some((rule) => rule.id === `custom.${index}`)) index += 1;
  draft.value.rules.push({
    id: `custom.${index}`,
    title: "自定义检查",
    category: "custom",
    severity: "medium",
    when: { fact: facts.value[0]?.key ?? "", op: "exists", value: true },
    evidence: "请填写这条规则命中的证据描述：它要能被独立核对。",
    suggestion: "请填写语义保持的改进建议：改写不得改变查询语义。",
    confidence: 0.6,
  });
}

function removeRule(index: number) {
  if (!draft.value || !canEdit.value) return;
  draft.value.rules = (draft.value.rules ?? []).filter((_, position) => position !== index);
}

/**
 * 复制为自定义 —— 内置包唯一的修改路径。
 *
 * 内置包的标识是保留标识，后端会拒绝在这个标识下写入，所以「就地编辑」不是一个可选做法：
 * 它要么被拒绝，要么在下次升级时被覆盖。副本是唯一诚实的答案。
 */
async function createFromDraft() {
  const id = newPackId.value.trim();
  if (!id) {
    message.value = "请填写新规则包标识（小写字母、数字、- 或 _）。";
    return;
  }
  if (!newPackFromBlank && !draft.value) return;
  const source: RulePackManifest = newPackFromBlank
    ? {
        apiVersion: "eap/v1",
        kind: "RulePack",
        id,
        name: "自定义规则包",
        version: 1,
        description: "由控制台创建",
        requires: { capabilities: ["sql.parse"] },
        rules: [
          {
            id: "custom.1",
            title: "自定义检查",
            category: "custom",
            severity: "medium",
            when: { fact: facts.value[0]?.key ?? "", op: "exists", value: true },
            evidence: "请填写这条规则命中的证据描述。",
            suggestion: "请填写语义保持的改进建议。",
            confidence: 0.6,
          },
        ],
      }
    : { ...draft.value!, id, name: `${draft.value!.name}（副本）` };
  busy.value = true;
  message.value = "";
  try {
    await runtimeApi.createRulePack(source.name, JSON.stringify(source, null, 2));
    message.value = newPackFromBlank
      ? `已创建 ${id}，现在可以编辑它。`
      : `已复制为 ${id}：副本可以改，原始内置包保持只读，升级时不会被你的改动覆盖。`;
    newPackOpen.value = false;
    newPackId.value = "";
    await refresh();
    await selectPack(id);
    emit("saved");
  } catch (cause) {
    message.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

async function togglePack() {
  const pack = selectedPack.value;
  if (!pack || pack.shipped || busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    await runtimeApi.setRulePackActivation(pack.id, !pack.enabled);
    message.value = pack.enabled
      ? `已停用 ${pack.id}。停用后引用它的专家会失去这些规则，所以被已启用专家引用时后端会拒绝。`
      : `已启用 ${pack.id}。`;
    await refresh();
    emit("saved");
  } catch (cause) {
    message.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

async function deletePack() {
  const pack = selectedPack.value;
  if (!pack || busy.value) return;
  busy.value = true;
  deleteRefusal.value = "";
  try {
    await runtimeApi.deleteRulePack(pack.id);
    message.value = `已删除 ${pack.id}。`;
    deleteOpen.value = false;
    await refresh();
    emit("saved");
  } catch (cause) {
    // 后端拒绝时保留对话框与按钮，把原因写在旁边 —— 控件不消失，才解释得清。
    deleteRefusal.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}

function openAdvanced() {
  advancedText.value = draftText.value;
  advancedOpen.value = true;
}
function applyAdvanced() {
  try {
    const parsed = JSON.parse(advancedText.value) as RulePackManifest;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("清单必须是一个 JSON 对象");
    if (!Array.isArray(parsed.rules)) throw new Error("清单必须包含 rules 数组");
    draft.value = { ...parsed, id: parsed.id ?? selectedId.value };
    message.value = "已应用到草稿；复合条件可以在保存前用「校验」复核。";
  } catch (cause) {
    message.value = "JSON 无法解析为规则包草稿：" + errorMessage(cause);
  }
}

async function runDryRun() {
  if (dryBusy.value || !drySql.value.trim() || !draft.value) return;
  if (localProblems.value.length) {
    dryError.value = localProblems.value.join("；");
    dry.value = null;
    return;
  }
  dryBusy.value = true;
  dryError.value = "";
  dry.value = null;
  try {
    // 试算用的是**当前草稿**：试的东西就是正在改的东西。
    dry.value = await runtimeApi.dryRunRulePack(drySql.value, draftText.value);
  } catch (cause) {
    dryError.value = errorMessage(cause);
  } finally {
    dryBusy.value = false;
  }
}

onMounted(refresh);
defineExpose({ refresh });
</script>

<template>
  <section class="view">
    <div class="page-head">
      <p class="eyebrow">RULE LIBRARY</p>
      <h1>规则库</h1>
      <p>
        规则是数据，不是代码：新增、调整严重级、改写证据与建议都只需编辑规则包，无需重新编译或部署。
        试算使用与运行时相同的判定引擎，且不会执行 SQL、不会保存任何内容。
      </p>
    </div>

    <Feedback tone="error" v-if="error" role="alert">{{ error }}</Feedback>
    <Feedback v-if="message">{{ message }}</Feedback>

    <div class="grid-2 rule-layout">
      <article class="eap-panel">
        <header class="panel-head">
          <div>
            <h2>规则包</h2>
            <p>内置包为只读，复制为新标识后即可编辑。</p>
          </div>
          <div class="form-actions">
            <Button variant="secondary" :disabled="loading" @click="refresh">
              {{ loading ? "加载中…" : "刷新" }}
            </Button>
            <Button
              variant="primary"
              :disabled="busy"
              @click="
                newPackFromBlank = true;
                newPackId = '';
                newPackOpen = !newPackOpen;
              "
            >
              ＋ 新建
            </Button>
            <Button
              variant="secondary"
              v-if="draft"
              :disabled="busy"
              @click="
                newPackFromBlank = false;
                newPackId = '';
                newPackOpen = !newPackOpen;
              "
            >
              复制为自定义
            </Button>
          </div>
        </header>
        <form v-if="newPackOpen" class="pack-form" @submit.prevent="createFromDraft">
          <p class="hint">
            {{
              newPackFromBlank
                ? "从空白模板创建一个规则包。"
                : `从当前选中的「${draft?.name ?? ""}」复制一个可编辑的副本。`
            }}
            内置标识是保留标识，后端拒绝在其下写入，所以副本是修改内置规则包的唯一方式。
          </p>
          <label
            >新标识
            <input
              v-model="newPackId"
              class="workspace-input"
              placeholder="my-team-sql"
              aria-label="新规则包标识"
            />
          </label>
          <p class="hint">标识规则：<code class="mono">^[a-z0-9][a-z0-9_-]{0,60}$</code></p>
          <div class="form-actions">
            <Button variant="primary" :disabled="busy || !newPackId.trim()"> 创建 </Button>
            <Button variant="secondary" type="button" @click="newPackOpen = false">取消</Button>
          </div>
        </form>
        <div class="list">
          <button
            v-for="pack in packs"
            :key="pack.id"
            class="list-item"
            :class="{ active: pack.id === selectedId }"
            :disabled="busy"
            @click="selectPack(pack.id)"
          >
            <span>
              <b>{{ pack.name }}</b>
              <small>
                <code class="mono">{{ pack.id }}</code>
                · {{ pack.ruleCount }} 条规则 ·
                {{ pack.shipped ? "内置只读" : pack.enabled ? "已启用" : "已停用" }}
                <template v-if="!pack.shipped"> · r{{ pack.revision }}</template>
              </small>
              <small class="requirement-line">
                需要能力：{{ pack.requires?.length ? pack.requires.join("、") : "未声明" }}
              </small>
            </span>
          </button>
        </div>
        <EmptyState v-if="!packs.length && !loading">没有可用的规则包。</EmptyState>
        <p class="hint">
          规则包的判定阈值也在这里：<code class="mono">policy.actionableWeight</code> 与
          <code class="mono">reviewComplexityThreshold</code>
          决定确定性证据何时不足、需要把压缩后的证据提交给模型。
        </p>
        <p class="hint">
          规则读取事实，事实由能力产出：<code class="mono">requires.capabilities</code>
          声明本包需要哪些能力， 引用它的专家流程必须包含对应节点，否则这些规则永远不会命中。
        </p>
      </article>

      <article class="eap-panel">
        <header class="panel-head">
          <div>
            <h2>{{ draft?.name ?? "规则明细" }}</h2>
            <p v-if="draft">
              <code class="mono">{{ draft.id }}</code>
              <template v-if="selectedPack"> · revision {{ selectedPack.revision }}</template>
              <template v-if="selectedPack">
                · {{ selectedPack.enabled ? "已启用" : "已停用" }}</template
              >
            </p>
            <p v-else>选择左侧规则包以查看其规则。</p>
          </div>
          <Badge
            tone="neutral"
            v-if="draft"
            :class="shipped ? 'eap-badge--neutral' : 'eap-badge--success'"
          >
            {{ shipped ? "内置只读" : "可编辑" }}
          </Badge>
        </header>

        <template v-if="draft">
          <div class="draft-line">
            <Badge tone="neutral" :class="dirty ? 'eap-badge--warning' : 'eap-badge--neutral'">
              {{ shipped ? "内置只读（修改请先复制）" : dirty ? "有未保存的修改" : "已保存" }}
            </Badge>
            <template v-if="!shipped">
              <Button variant="secondary" :disabled="busy" @click="validateDraft">校验</Button>
              <Button variant="primary" :disabled="busy || !dirty" @click="saveDraft">
                {{ busy ? "处理中…" : "保存草稿" }}
              </Button>
              <Button variant="secondary" :disabled="busy || !dirty" @click="discardDraft">
                放弃修改
              </Button>
              <Button variant="secondary" :disabled="busy || dirty" @click="togglePack">
                {{ selectedPack?.enabled ? "停用" : "启用" }}
              </Button>
              <Button variant="danger" :disabled="busy" @click="deleteOpen = true"> 删除 </Button>
            </template>
            <Button
              variant="secondary"
              v-else
              :disabled="busy"
              @click="
                newPackFromBlank = false;
                newPackId = '';
                newPackOpen = true;
              "
            >
              复制为自定义
            </Button>
          </div>

          <p v-if="shipped" class="hint">
            内置规则包由代码随版本发布，标识是保留标识：后端会拒绝在这个标识下写入。
            任何编辑入口都会说明这一点，并提供「复制为自定义」——就地修改会在下次升级时被静默覆盖。
          </p>

          <ul v-if="localProblems.length" class="rule-errors">
            <li v-for="problem in localProblems" :key="problem">{{ problem }}</li>
          </ul>
          <div v-if="validation" class="validation-block">
            <Feedback class="hint" :tone="validation.valid ? 'info' : 'error'">
              {{
                validation.valid
                  ? "后端校验通过。"
                  : "后端校验未通过：" + validation.errors.join("；")
              }}
            </Feedback>
          </div>

          <div v-if="requirements" class="requirement-block">
            <div class="result-heading">
              <strong>该规则包需要的能力</strong>
              <Badge
                tone="neutral"
                :class="
                  declaredRequirementMismatch.length ? 'eap-badge--warning' : 'eap-badge--success'
                "
              >
                {{ declaredRequirementMismatch.length ? "声明不完整" : "声明完整" }}
              </Badge>
            </div>
            <p class="hint">
              已保存版本声明：<b>{{
                requirements.declared.length ? requirements.declared.join("、") : "未声明"
              }}</b>
              · 按事实推导：<b>{{ requirements.derived.join("、") }}</b>
            </p>
            <p v-if="dirty" class="hint">
              当前草稿推导出的能力：<b>{{ draftDerived.join("、") || "（无）" }}</b
              >。 声明可以比它更宽，但不能更窄——更窄会让「规则永不命中」看起来像「没有问题」。
            </p>
            <Feedback tone="error" v-if="declaredRequirementMismatch.length">
              requires.capabilities 缺少规则实际依赖的能力：{{
                declaredRequirementMismatch.join("、")
              }}。保存时会被拒绝。
            </Feedback>
            <p v-else class="hint">
              事实来源与声明一致，因此引用本包的专家流程必须包含
              {{ requirements.declared.join("、") }} 节点。
            </p>
            <p v-if="draft.requires?.note" class="hint">{{ draft.requires.note }}</p>
          </div>

          <article
            v-for="(rule, index) in rules"
            :key="rule.id"
            class="rule"
            :class="{ 'rule--draft': !shipped }"
          >
            <div class="result-heading">
              <strong v-if="shipped">{{ rule.title ?? rule.id }}</strong>
              <span class="sev" :class="rule.severity">{{ severityText(rule.severity) }}</span>
              <Button
                variant="ghost"
                v-if="!shipped"
                @click="removeRule(index)"
                class="rule-remove"
              >
                移除规则
              </Button>
            </div>
            <div class="mono rule-code">
              {{ rule.id }}<template v-if="rule.category"> · {{ rule.category }}</template>
              <template v-if="rule.when"> · 依赖 {{ producerOf(rule.when.fact ?? "") }}</template>
            </div>

            <template v-if="shipped">
              <div class="rule-cond"><b>当</b> {{ conditionText(rule.when) }}</div>
              <div
                v-for="(override, position) in rule.severityWhen ?? []"
                :key="position"
                class="rule-cond rule-cond--sub"
              >
                <b>若</b> {{ conditionText(override.when) }} → 升级为
                {{ severityText(override.severity) }}
              </div>
              <p class="evidence">{{ rule.evidence }}</p>
              <p class="rule-suggestion">{{ rule.suggestion }}</p>
            </template>

            <div v-else class="rule-edit">
              <label
                >标题<input
                  :value="rule.title ?? ''"
                  class="workspace-input"
                  @input="rule.title = eventValue($event)"
              /></label>
              <label
                >严重级
                <select
                  :value="rule.severity ?? 'medium'"
                  class="workspace-input"
                  @change="rule.severity = eventValue($event)"
                >
                  <option v-for="level in severityOptions" :key="level" :value="level">
                    {{ severityText(level) }}
                  </option>
                </select>
              </label>
              <div class="rule-cond">
                <b>当</b>
                <template v-if="isLeaf(rule.when)">
                  <select
                    :value="conditionFact(rule)"
                    class="workspace-input"
                    aria-label="事实"
                    @change="setConditionFact(rule, eventValue($event))"
                  >
                    <option v-for="fact in facts" :key="fact.key" :value="fact.key">
                      {{ fact.key }}
                    </option>
                  </select>
                  <select
                    :value="conditionOp(rule)"
                    class="workspace-input"
                    aria-label="运算符"
                    @change="setConditionOp(rule, eventValue($event))"
                  >
                    <option v-for="operator in operators" :key="operator" :value="operator">
                      {{ operatorText[operator] ?? operator }}
                    </option>
                  </select>
                  <input
                    :value="conditionValue(rule)"
                    class="workspace-input"
                    aria-label="比较值"
                    @input="setConditionValue(rule, eventValue($event))"
                  />
                </template>
                <template v-else-if="isCompound(rule.when)">
                  <span class="hint">
                    复合条件（all / any / not）：{{ conditionText(rule.when) }}。
                    结构化编辑只覆盖单事实条件；复合条件请在下方「JSON
                    草稿」里改，保存前用「校验」复核。
                  </span>
                </template>
                <template v-else>
                  <span class="hint">无条件（总是命中）。</span>
                  <Button variant="secondary" @click="resetCondition(rule)">改为单事实条件</Button>
                </template>
              </div>
              <label
                >证据模板
                <textarea
                  :value="rule.evidence ?? ''"
                  class="workspace-input"
                  rows="2"
                  @input="rule.evidence = eventValue($event)"
                />
              </label>
              <label
                >建议
                <textarea
                  :value="rule.suggestion ?? ''"
                  class="workspace-input"
                  rows="2"
                  @input="rule.suggestion = eventValue($event)"
                />
              </label>
            </div>
          </article>
          <EmptyState v-if="!rules.length">
            该规则包没有规则。自定义包可以「添加规则」。
          </EmptyState>
          <Button variant="secondary" v-if="!shipped" @click="addRule">＋ 添加规则</Button>

          <div v-if="!shipped" class="advanced">
            <Button
              variant="secondary"
              @click="advancedOpen ? (advancedOpen = false) : openAdvanced()"
            >
              {{ advancedOpen ? "收起 JSON 草稿" : "编辑 JSON 草稿" }}
            </Button>
            <template v-if="advancedOpen">
              <p class="hint">
                这是后端真正接收的东西。复合条件、阈值与 policy
                只能在这里改——与其做一个覆盖不了全部字段的
                结构化表单，不如把真实清单摊开，并用「校验」判定。
              </p>
              <textarea
                v-model="advancedText"
                class="workspace-input code-input"
                rows="14"
                spellcheck="false"
                aria-label="规则包 JSON 草稿"
              />
              <Button variant="secondary" @click="applyAdvanced">应用到草稿</Button>
            </template>
          </div>
        </template>
        <EmptyState v-else>尚未选择规则包。</EmptyState>
      </article>
    </div>

    <article class="eap-panel panel-block">
      <header class="panel-head">
        <div>
          <h2>试算（dry-run）</h2>
          <p>用<b>当前编辑中的草稿</b>判定一条 SQL，返回命中的事实与发现；不保存、不执行。</p>
        </div>
      </header>
      <form @submit.prevent="runDryRun">
        <label class="field-label" for="dry-sql">待试算 SQL</label>
        <textarea
          id="dry-sql"
          v-model="drySql"
          class="workspace-input code-input"
          rows="4"
          spellcheck="false"
          :disabled="dryBusy || !draft"
          placeholder="SELECT …"
        />
        <div class="form-actions">
          <Button variant="primary" type="submit" :disabled="dryBusy || !drySql.trim() || !draft">
            {{ dryBusy ? "试算中…" : "试算" }}
          </Button>
          <Button
            variant="secondary"
            type="button"
            :disabled="dryBusy"
            @click="
              drySql = '';
              dry = null;
              dryError = '';
            "
          >
            清空
          </Button>
          <span v-if="dirty" class="hint">试算用的是当前草稿（含未保存的修改）。</span>
        </div>
      </form>
      <Feedback tone="error" v-if="dryError" role="alert">{{ dryError }}</Feedback>

      <div v-if="dry" class="dry-result">
        <template v-if="dry.valid">
          <p class="hint">
            {{ dry.summary }} · 复杂度 {{ dry.complexity ?? 0 }} · 解析状态 {{ dry.parseStatus }}
          </p>
          <p v-if="dry.requirements" class="hint">
            试算按「全部能力都可用」执行；该包声明需要
            <b>{{ dry.requirements.declared.join("、") || "未声明" }}</b
            >，事实推导需要 <b>{{ dry.requirements.derived.join("、") }}</b
            >。
          </p>
          <div v-if="dry.blockedRules?.length" class="eap-feedback">
            有 {{ dry.blockedRules.length }} 条规则因缺少事实产出能力而未判定：
            {{
              dry.blockedRules
                .map((item) => item.rule + "（" + item.missingCapabilities.join("、") + "）")
                .join("；")
            }}
          </div>
          <div class="findings">
            <div
              v-for="finding in dry.findings ?? []"
              :key="finding.code"
              class="finding finding--static"
            >
              <span class="sev" :class="finding.severity">{{
                severityText(finding.severity)
              }}</span>
              <span>
                <span class="code mono">{{ finding.code }}</span>
                <p class="evidence">{{ finding.evidence }}</p>
              </span>
            </div>
            <EmptyState v-if="!dry.findings?.length">没有规则命中。</EmptyState>
          </div>

          <h3>命中的事实（{{ matchedFacts.length }}）</h3>
          <table class="data-table facts-table">
            <thead>
              <tr>
                <th>事实</th>
                <th>值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="[key, value] in matchedFacts" :key="key">
                <td class="mono">{{ key }}</td>
                <td>{{ displayValue(value) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <ul v-else class="rule-errors">
          <li v-for="item in dry.errors" :key="item">{{ item }}</li>
        </ul>
      </div>
    </article>

    <article class="eap-panel panel-block">
      <header class="panel-head">
        <div>
          <h2>事实与运算符词表</h2>
          <p>规则只能引用这里声明的事实；写错事实名或运算符会在保存时被拒绝。</p>
        </div>
      </header>
      <p class="hint">
        每个事实都声明它由哪个能力产出。规则引用某条事实，就等于要求专家流程包含产出该事实的能力节点——
        这正是<code class="mono">requires.capabilities</code> 的校验依据。
      </p>
      <p class="hint mono">运算符：{{ operators.join(" · ") }}</p>
      <div v-for="[producer, items] in factsByProducer" :key="producer" class="fact-group">
        <h3>
          {{ producer }} <span class="kind-id mono">产出 {{ items.length }} 项事实</span>
        </h3>
        <table class="data-table facts-table">
          <thead>
            <tr>
              <th>事实</th>
              <th>类型</th>
              <th>类别</th>
              <th>含义</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fact in items" :key="fact.key">
              <td class="mono">{{ fact.key }}</td>
              <td>{{ fact.type }}</td>
              <td>{{ fact.group }}</td>
              <td>{{ fact.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <ConfirmBox
      v-if="deleteOpen && selectedPack"
      :title="`删除规则包 ${selectedPack.id}？`"
      :impact="[
        `该包有 ${selectedPack.ruleCount} 条规则，删除后引用它的专家会失去这些检查。`,
        '若仍被某个已启用的专家引用，后端会拒绝这次删除并点名这些专家。',
        '内置规则包不可删除：它们的标识由代码保留。',
      ]"
      confirm-label="删除规则包"
      danger
      :busy="busy"
      :refusal="deleteRefusal"
      @confirm="deletePack"
      @cancel="
        deleteOpen = false;
        deleteRefusal = '';
      "
    />
  </section>
</template>
