import { analyzeComparison, parseComparisonSummary } from "../src/compare-analysis"
import { evaluationContractHash } from "../src/evaluation"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "../src/report"

const iterations = 20_000
const seed = 20261005
let state = seed
const random = () => {
  state = (Math.imul(1664525,state) + 1013904223) >>> 0
  return state / 4294967296
}
const judge: NonNullable<RunSummary["judge"]> = { backend:"codex",codex_version:"simulation",model:"simulation",reasoning:"medium",prompt_sha256:"simulation-prompt",schema_sha256:"simulation-schema" }
const contract = evaluationContractHash({rubric_hash:"simulation-rubric",judge,pass_threshold:70})

// Повторы зависимы только в пределах задачи; группы задач и стороны A/B
// независимы, кроме явно paired сценария. Три оси коррелированы полностью.
function summary(probabilities: number[], dependent: boolean): RunSummary {
  const tasks = probabilities.map((probability,index) => {
    const id = `task-${index}`
    const shared = random() < probability
    const attempts = Array.from({length:3}, (_,index): AttemptResult => {
      const success = dependent ? shared : random() < probability
      return {
        task_id:id,attempt:index+1,status:success?"completed":"no_artifact",
        exit_code:0,timed_out:false,interrupted:false,failure_kind:null,
        score:success?100:0,structural_score:success?100:0,pass:success,oracle_pass:success,
        evaluation_contract_hash:contract,judge_status:success?"scored":"no_artifact",
        judge_attempts:success?1:0,judge_confidence:"high",judge_summary:null,checklist:null,
        duration_ms:1,cost:0,tokens:{input:0,output:0,reasoning:0},
        counters:{toolCalls:0,loginomToolCalls:0,toolErrors:0,memoryToolCalls:0},
        package_path:null,artifact_origin:null,artifact_ambiguous:[],cleanup_error:null,
        action_manifest_sha256:null,session_id:null,profile_recovered:false,errors:[],harness_error:null,stderr_head:null,
      }
    })
    return { id,attempts,metrics:aggregateTask(attempts,false),rubric_snapshot:{
      version:1 as const,checklist:[{id:"structure",weight:1,required:false,requires_result_file:false,requires_run:false,axis:"structure" as const}],
      oracle_applicable:true,oracle_tolerance:0.01,
    } }
  })
  return {
    run_id:"simulation",label:null,started_at:"",finished_at:"",interrupted:false,interrupted_cleanup:null,stopped_reason:null,
    agent:{cli_mode:"fake",git_sha:"simulation",dirty:false,model:"simulation/model",variant:"medium"},
    judge,dock:{skill_revision:"simulation",action_manifest_sha256:["simulation"]},
    loginom:{image_digest:"simulation",container:null,storage_dir:null},
    agent_inputs_hash:"simulation-inputs",rubric_hash:"simulation-rubric",task_ids:tasks.map((task) => task.id),
    config:{repeat:3,timeout_ms:1000,task_timeout_ms:Object.fromEntries(tasks.map((task) => [task.id,1000])),judge_timeout_ms:1000,pass_threshold:70,keep_storage:false},
    metrics:aggregate(tasks.flatMap((task) => task.attempts),false),tasks,storage_leftovers:[],
  }
}

parseComparisonSummary(JSON.parse(JSON.stringify(summary([0.5],true))))
for (const count of [25,39]) {
  const a = summary(Array.from({length:count}, () => 1),true)
  const b = summary(Array.from({length:count}, () => 0),true)
  if (analyzeComparison(a,b).axes.completion.verdict !== (count === 25 ? "indistinguishable" : "worse")) throw Error("deterministic boundary")
}
const unchanged = summary(Array.from({length:5}, () => 1),true)
const small = analyzeComparison(unchanged,unchanged)
if (small.axes.completion.interval?.lower !== -1 || small.axes.completion.interval.upper !== 1 || small.axes.completion.non_inferiority !== "inconclusive") throw Error("degenerate interval")

const scenarios = [5,25,39,100].flatMap((count) => [
  ...[false,true].flatMap((dependent) => [
    ...[0.2,0.5,0.8].map((p) => ({name:`unchanged-${p}`,count,dependent,paired:false,a:Array.from({length:count}, () => p),b:Array.from({length:count}, () => p)})),
    {name:"heterogeneous-unchanged",count,dependent,paired:false,a:Array.from({length:count}, (_,i) => [0.2,0.5,0.8][i%3]!),b:Array.from({length:count}, (_,i) => [0.2,0.5,0.8][i%3]!)},
    {name:"degradation-0.95-to-0.05",count,dependent,paired:false,a:Array.from({length:count}, () => 0.95),b:Array.from({length:count}, () => 0.05)},
  ]),
  {name:"paired-heterogeneous-unchanged",count,dependent:true,paired:true,a:Array.from({length:count}, (_,i) => [0.2,0.5,0.8][i%3]!),b:Array.from({length:count}, (_,i) => [0.2,0.5,0.8][i%3]!)},
])
const results = []
const upper95 = (events: number) => events === 0 ? 1 - Math.pow(0.05,1/iterations) :
  Math.min(1,events/iterations + Math.sqrt(Math.log(20)/(2*iterations)))
for (const scenario of scenarios) {
  const drop = scenario.a.reduce((sum,p,i) => sum+p-scenario.b[i]!,0)/scenario.count
  let falseDirection = 0
  let falseNI = 0
  let worse = 0
  let better = 0
  let confirmed = 0
  let guardComparisons = 0
  const guards = {completion:0,oracle:0,pass:0}
  for (let index = 0; index < iterations; index++) {
    const a = summary(scenario.a,scenario.dependent)
    const b = scenario.paired ? a : summary(scenario.b,scenario.dependent)
    const result = analyzeComparison(a,b)
    const axes = Object.values(result.axes)
    if (axes.some((axis) => axis.verdict === "worse")) worse++
    if (axes.some((axis) => axis.verdict === "better")) better++
    if (axes.some((axis) => axis.non_inferiority === "confirmed")) confirmed++
    if (axes.some((axis) => axis.verdict === "worse" && drop <= result.policy.margin || axis.verdict === "better" && drop >= -result.policy.margin)) falseDirection++
    if (drop > result.policy.margin && axes.some((axis) => axis.non_inferiority === "confirmed")) falseNI++
    if (result.tasks.some((task) => task.regressions.length)) guardComparisons++
    result.tasks.forEach((task) => task.regressions.forEach((guard) => { guards[guard]++ }))
  }
  const row = {
    scenario:scenario.name,tasks:scenario.count,dependent_repeats:scenario.dependent,paired_ab:scenario.paired,
    comparisons:iterations,true_drop:drop,
    inferential:{worse:worse/iterations,better:better/iterations,false_direction:falseDirection/iterations,false_direction_upper95:upper95(falseDirection)},
    non_inferiority:{confirmed:confirmed/iterations,false_confirmed:falseNI/iterations,false_confirmed_upper95:upper95(falseNI)},
    observed_guard:{comparison_rate:guardComparisons/iterations,task_counts:guards},
  }
  if (upper95(falseDirection) > 0.05 || drop > 0.5 && upper95(falseNI) > 0.05) throw Error(`Monte Carlo acceptance failed: ${JSON.stringify(row)}`)
  results.push(row)
  console.error(`checked ${results.length}/${scenarios.length}: T=${scenario.count} ${scenario.name} dependent=${scenario.dependent}`)
}
console.log(JSON.stringify({
  seed,iterations,policy:{margin:0.5,confidence:0.95,k:3},
  assumptions:"independent task groups; axes perfectly correlated; A/B independent unless paired_ab",
  monte_carlo:"per-scenario one-sided 95% upper: exact zero-event binomial bound, otherwise Hoeffding; no simultaneous MC claim",
  results,
},null,2))
