export function closedRouteArguments(args:string[]) {
  if(args.length===1&&args[0]==="plan")return {command:"plan" as const,file:null}
  if(args.length!==2||!["execute","worker","admit-helper"].includes(args[0]!)||!args[1]!.startsWith("/")||args[1]!.includes("\0"))throw Error("CLOSED_ROUTE_ARGUMENTS")
  return {command:args[0] as "execute"|"worker"|"admit-helper",file:args[1]!}
}

export type ClosedSettlement={operation:"LAB57-closed-owned-v1";originalOutcome:"ERROR";quality:"EXCLUDED";sourceSha:string;
  cessation:{status:string;ownerTask:string;originalOutcome:string;cleanup:string};logout:{status:string;observerKey:string;account:string;document:string;emptyPackages:boolean};
  process:{status:string;observation_mode:string;capture_complete:boolean;error:string|null;unknownProcesses:unknown[];verification:{owned_remaining:number;observed_at:string}[]};
  history:{status:string;assistantRows:number;model:string;originalRowsPreserved:boolean;coherentSnapshot:boolean};guard:{status:string};csv:{status:string}}
export function verifyClosedSettlement(s:ClosedSettlement) {
  if(s.operation!=="LAB57-closed-owned-v1"||s.originalOutcome!=="ERROR"||s.quality!=="EXCLUDED"||!/^[0-9a-f]{40}$/.test(s.sourceSha)
    ||s.cessation?.status!=="SERVER_OWNERSHIP_SCOPE_CEASED"||s.cessation.ownerTask!=="01a1375d-ce4a-7c35-a3a3-94cf64a8b589"||s.cessation.originalOutcome!=="ERROR"||s.cessation.cleanup!=="UNCONFIRMED"
    ||s.logout?.status!=="OWN_DIAGNOSTIC_LOGGED_OUT"||!s.logout.observerKey||!s.logout.account||s.logout.account==="user"||!s.logout.document||s.logout.emptyPackages!==true
    ||s.process?.status!=="confirmed"||s.process.observation_mode!=="continuous"||s.process.capture_complete!==true||s.process.error!==null
    ||!Array.isArray(s.process.unknownProcesses)||s.process.unknownProcesses.length||!Array.isArray(s.process.verification)||s.process.verification.length<2
    ||s.process.verification.slice(-2).some(p=>p.owned_remaining!==0||!Number.isFinite(Date.parse(p.observed_at)))
    ||s.history?.status!=="OFFICIAL_HISTORY_VERIFIED"||s.history.assistantRows!==77||s.history.model!=="openai/gpt-6-luna/high"
    ||s.history.originalRowsPreserved!==true||s.history.coherentSnapshot!==true||s.guard?.status!=="RECORD_ARCHIVED"||s.csv?.status!=="OWNED_CSV_REMOVED")throw Error("GENUINE_CLOSED_SETTLEMENT_REQUIRED")
}
