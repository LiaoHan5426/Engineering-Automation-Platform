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
} from "./api";
import { errorMessage } from "./presentation";

const packs = ref<RulePackSummary[]>([]);
const facts = ref<RuleFact[]>([]);
const operators = ref<string[]>([]);
const selectedId = ref("");
const manifest = ref<RulePackManifest | null>(null);
const manifestText = ref("");
const editable = ref(false);
const requirements = ref<RuleRequirements | null>(null);
const loading = ref(false);
const error = ref("");

const drySql = ref("");
const dryBusy = ref(false);
const dryError = ref("");
const dry = ref<DryRunResult | null>(null);

const rules = computed<RuleDefinition[]>(() => manifest.value?.rules ?? []);
const selectedPack = computed(() => packs.value.find((pack) => pack.id === selectedId.value));
const matchedFacts = computed(() => Object.entries(dry.value?.facts ?? {}));
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
  const missing = derived.filter((capability) => !declared.includes(capability));
  return missing;
});

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
    manifest.value = null;
    manifestText.value = "";
    editable.value = false;
    requirements.value = null;
    return;
  }
  selectedId.value = id;
  error.value = "";
  try {
    const detail = await runtimeApi.rulePack(id);
    manifestText.value = detail.manifest;
    manifest.value = JSON.parse(detail.manifest) as RulePackManifest;
    editable.value = detail.editable;
    requirements.value = detail.requirements ?? null;
    dry.value = null;
    dryError.value = "";
  } catch (cause) {
    manifest.value = null;
    requirements.value = null;
    error.value = errorMessage(cause);
  }
}

async function runDryRun() {
  if (dryBusy.value || !drySql.value.trim() || !manifestText.value) return;
  dryBusy.value = true;
  dryError.value = "";
  dry.value = null;
  try {
    dry.value = await runtimeApi.dryRunRulePack(drySql.value, manifestText.value);
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

    <p v-if="error" class="eap-feedback eap-feedback--error" role="alert">{{ error }}</p>

    <div class="grid-2 rule-layout">
      <article class="eap-panel">
        <header class="panel-head">
          <div><h2>规则包</h2><p>内置包为只读，复制为新标识后即可编辑。</p></div>
          <button class="eap-button" :disabled="loading" @click="refresh">
            {{ loading ? "加载中…" : "刷新" }}
          </button>
        </header>
        <div class="list">
          <button
            v-for="pack in packs"
            :key="pack.id"
            class="list-item"
            :class="{ active: pack.id === selectedId }"
            @click="selectPack(pack.id)"
          >
            <span>
              <b>{{ pack.name }}</b>
              <small>
                <code class="mono">{{ pack.id }}</code>
                · {{ pack.ruleCount }} 条规则
                · {{ pack.shipped ? "内置只读" : pack.enabled ? "已启用" : "已停用" }}
                <template v-if="!pack.shipped"> · r{{ pack.revision }}</template>
              </small>
              <small class="requirement-line">
                需要能力：{{ pack.requires?.length ? pack.requires.join("、") : "未声明" }}
              </small>
            </span>
          </button>
        </div>
        <p v-if="!packs.length && !loading" class="empty-state">没有可用的规则包。</p>
        <p class="hint">
          规则包的判定阈值也在这里：<code class="mono">policy.actionableWeight</code> 与
          <code class="mono">reviewComplexityThreshold</code> 决定确定性证据何时不足、需要把压缩后的证据提交给模型。
        </p>
        <p class="hint">
          规则读取事实，事实由能力产出：<code class="mono">requires.capabilities</code> 声明本包需要哪些能力，
          引用它的专家流程必须包含对应节点，否则这些规则永远不会命中。
        </p>
      </article>

      <article class="eap-panel">
        <header class="panel-head">
          <div>
            <h2>{{ manifest?.name ?? "规则明细" }}</h2>
            <p v-if="manifest">{{ manifest.description ?? manifest.id }}</p>
            <p v-else>选择左侧规则包以查看其规则。</p>
          </div>
          <span v-if="selectedPack" class="eap-badge" :class="selectedPack.shipped ? 'eap-badge--neutral' : 'eap-badge--success'">
            {{ selectedPack.shipped ? "内置只读" : "可编辑" }}
          </span>
        </header>

        <div v-if="manifest" class="rules">
          <div v-if="requirements" class="requirement-block">
            <div class="result-heading">
              <strong>该规则包需要的能力</strong>
              <span
                class="eap-badge"
                :class="declaredRequirementMismatch.length ? 'eap-badge--warning' : 'eap-badge--success'"
              >
                {{ declaredRequirementMismatch.length ? "声明不完整" : "声明完整" }}
              </span>
            </div>
            <p class="hint">
              声明：<b>{{ requirements.declared.length ? requirements.declared.join("、") : "未声明" }}</b>
              · 按规则引用的事实推导：<b>{{ requirements.derived.join("、") }}</b>
            </p>
            <p v-if="declaredRequirementMismatch.length" class="eap-feedback eap-feedback--error">
              requires.capabilities 缺少规则实际依赖的能力：{{ declaredRequirementMismatch.join("、") }}。保存时会被拒绝。
            </p>
            <p v-else class="hint">
              事实来源与声明一致，因此引用本包的专家流程必须包含 {{ requirements.declared.join("、") }} 节点。
            </p>
            <p v-if="manifest.requires?.note" class="hint">{{ manifest.requires.note }}</p>
          </div>
          <article v-for="rule in rules" :key="rule.id" class="rule">
            <div class="result-heading">
              <strong>{{ rule.title ?? rule.id }}</strong>
              <span class="sev" :class="rule.severity">{{ severityText(rule.severity) }}</span>
            </div>
            <div class="mono rule-code">{{ rule.id }}<template v-if="rule.category"> · {{ rule.category }}</template></div>
            <div class="rule-cond"><b>当</b> {{ conditionText(rule.when) }}</div>
            <div v-for="(override, index) in rule.severityWhen ?? []" :key="index" class="rule-cond rule-cond--sub">
              <b>若</b> {{ conditionText(override.when) }} → 升级为 {{ severityText(override.severity) }}
            </div>
            <p class="evidence">{{ rule.evidence }}</p>
            <p class="rule-suggestion">{{ rule.suggestion }}</p>
          </article>
          <p v-if="!rules.length" class="empty-state">该规则包没有规则。</p>
        </div>
        <p v-else class="empty-state">尚未选择规则包。</p>
      </article>
    </div>

    <article class="eap-panel panel-block">
      <header class="panel-head">
        <div>
          <h2>试算（dry-run）</h2>
          <p>用当前规则包判定一条 SQL，返回命中的事实与发现；不保存、不执行。</p>
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
          :disabled="dryBusy || !manifest"
          placeholder="SELECT …"
        />
        <div class="form-actions">
          <button type="submit" class="eap-button eap-button--primary" :disabled="dryBusy || !drySql.trim() || !manifest">
            {{ dryBusy ? "试算中…" : "试算" }}
          </button>
          <button type="button" class="eap-button" :disabled="dryBusy" @click="drySql = ''; dry = null; dryError = ''">
            清空
          </button>
        </div>
      </form>
      <p v-if="dryError" class="eap-feedback eap-feedback--error" role="alert">{{ dryError }}</p>

      <div v-if="dry" class="dry-result">
        <template v-if="dry.valid">
          <p class="hint">{{ dry.summary }} · 复杂度 {{ dry.complexity ?? 0 }} · 解析状态 {{ dry.parseStatus }}</p>
          <p v-if="dry.requirements" class="hint">
            试算按“全部能力都可用”执行；该包声明需要
            <b>{{ dry.requirements.declared.join("、") || "未声明" }}</b>，事实推导需要
            <b>{{ dry.requirements.derived.join("、") }}</b
            >。
          </p>
          <div v-if="dry.blockedRules?.length" class="eap-feedback">
            有 {{ dry.blockedRules.length }} 条规则因缺少事实产出能力而未判定：
            {{ dry.blockedRules.map((item) => item.rule + "（" + item.missingCapabilities.join("、") + "）").join("；") }}
          </div>
          <div class="findings">
            <div v-for="finding in dry.findings ?? []" :key="finding.code" class="finding finding--static">
              <span class="sev" :class="finding.severity">{{ severityText(finding.severity) }}</span>
              <span>
                <span class="code mono">{{ finding.code }}</span>
                <p class="evidence">{{ finding.evidence }}</p>
              </span>
            </div>
            <p v-if="!dry.findings?.length" class="empty-state">没有规则命中。</p>
          </div>

          <h3>命中的事实（{{ matchedFacts.length }}）</h3>
          <table class="data-table facts-table">
            <thead><tr><th>事实</th><th>值</th></tr></thead>
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
        <h3>{{ producer }} <span class="kind-id mono">产出 {{ items.length }} 项事实</span></h3>
        <table class="data-table facts-table">
          <thead><tr><th>事实</th><th>类型</th><th>类别</th><th>含义</th></tr></thead>
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
  </section>
</template>
