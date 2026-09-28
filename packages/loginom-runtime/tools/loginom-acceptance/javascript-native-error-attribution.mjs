import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {verifyNamedFailureOutcome} from './javascript-native-named-failure.mjs';
import {javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {javascriptCalibrationCase} from './javascript-calibration-cases.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';

// Reviewed recorded projection, not a caller-defined mapping or engine profile.
export const javascriptAttributionProfileSha256='f6e876d9d338087d42a2e16ba44611d1c39d03d6a27f0de1f66ca79467084247';
const need=(value,reason)=>{if(!value)throw Error('Native error attribution: '+reason);};
export const attributionSha256=value=>createHash('sha256').update(value).digest('hex');
export function readReviewedAttributionProfile(text){
 need(typeof text==='string'&&attributionSha256(text)===javascriptAttributionProfileSha256,'missing or forged calibration projection');
 const profile=JSON.parse(text);
 profile.calibrations.forEach(control=>{
  const source=javascriptCalibrationCase(control.id);
  need(control.source===source.source&&control.source_sha256===source.source_sha256
   &&attributionSha256(control.source)===control.source_sha256,'calibration source differs');
  const diagnostic=nativeAttributionDiagnostic({error_details:control.raw_diagnostic,native_error_complete:true,native_text_length:control.native_text_length});
  need(diagnostic.parsed&&diagnostic.frames.length===2&&diagnostic.frames[0].function==='Anonymous function'
   &&diagnostic.frames[0].source==='main'&&diagnostic.frames[0].line===control.source_line
   &&diagnostic.frames[1].function==='module'&&diagnostic.frames[1].source==='main'
   &&diagnostic.frames[1].line===1&&diagnostic.frames[1].column===1,'calibration line correspondence differs');
  need(control.source.split('\n')[control.source_line-1].trim().startsWith(control.id==='K4-native-caller-v1'?'const result=InputTable.Get(':'throw new Error('),'calibration statement differs');
  need(isDeepStrictEqual(control.provenance,profile.artifacts[control.id].sha256),'calibration artifact provenance differs');
 });
 return freezeCivilEvidence(profile);
}

export function nativeAttributionDiagnostic(failed){
 const raw=failed?.error_details;
 need(typeof raw==='string'&&raw.length>0&&raw.length<=1000&&failed.native_error_complete===true
  &&(failed.native_text_length===undefined||failed.native_text_length===raw.length)
  &&![failed.truncated,failed.redacted,failed.normalized].some(Boolean),'incomplete or transformed native diagnostic');
 const lines=raw.split('\n'),header=/^(Error|TypeError|RangeError|ReferenceError|SyntaxError): ([^\r\n]+)$/.exec(lines[0]);
 const frames=lines.slice(1).map(line=>/^   at (Anonymous function|module) \(<(main|preview)>:([1-9][0-9]*):([1-9][0-9]*)\)$/.exec(line));
 const parsed=Boolean(header)&&frames.length>0&&frames.every(frame=>frame
  &&Number.isSafeInteger(Number(frame[3]))&&Number.isSafeInteger(Number(frame[4])));
 return freezeCivilEvidence({raw,raw_utf16_length:raw.length,raw_sha256:attributionSha256(raw),
  parser:'native_error_header_and_frame_grammar_v1',parsed,
  error_class:header?.[1]??null,class_provenance:header?'parsed_native_header_not_structured_engine_class':'unrecognized_header',
  frames:parsed?frames.map(frame=>({function:frame[1],source:frame[2],line:Number(frame[3]),column:Number(frame[4])})):[],
  source_provenance:'owned_native_child_ErrorDetails',column_mapping:null});
}

// No I/O and no acceptance authority. Full retained artifact authentication is a
// separate mandatory layer; even that layer cannot establish server continuity.
export function verifyJavascriptNativeErrorAttribution({caseId,results,environment,calibration}){
 const profile=readReviewedAttributionProfile(calibration);
 need(['B-get-case','B-get-missing','B-isnull-case','B-isnull-missing'].includes(caseId),'unsupported exact expression');
 const outcome=verifyNamedFailureOutcome(results,caseId);
 need(isDeepStrictEqual(outcome,results.outcome),'historical failed outcome differs');
 need(isDeepStrictEqual(environment,profile.observed_domain),'runtime/frontend/build/schema domain differs');
 const source=javascriptNamedCase(caseId);
 need(attributionSha256(results.failed.source)===source.source_sha256
  &&source.source_sha256===profile.artifacts[caseId].source_sha256,'source hash differs');
 const diagnostic=nativeAttributionDiagnostic(results.failed);
 const caller=diagnostic.frames.filter(frame=>frame.function==='Anonymous function');
 const module=diagnostic.frames.filter(frame=>frame.function==='module');
 const reasons=[];
 if(!diagnostic.parsed)reasons.push('unrecognized_native_diagnostic');
 if(diagnostic.frames.some(frame=>frame.source!=='main'))reasons.push('preview_or_foreign_source_frame');
 if(caller.length!==1)reasons.push('missing_or_competing_caller_frames');
 if(module.length!==1||module[0].line!==1||module[0].column!==1||diagnostic.frames.length!==2)reasons.push('module_frame_not_unique_fixed_wrapper');
 if(diagnostic.parsed&&diagnostic.frames[0]?.function!=='Anonymous function')reasons.push('caller_frame_order_differs');
 if(caller.length===1&&caller[0].line!==4)reasons.push('caller_outside_exact_R_statement');
 const observedLineMatches=reasons.length===0;
 const get=caseId.startsWith('B-get-');
 // Whole-statement Get candidate transfers only observed caller-line behavior,
 // not the native cause/path. IsNull has no independent native caller control.
 if(!get)reasons.push('native_isnull_caller_not_calibrated');
 const candidate=observedLineMatches&&get;
 const statement=source.source.split('\n')[3];
 return freezeCivilEvidence({contract:'javascript-native-error-attribution-offline-1',case_id:caseId,
  status:candidate?'R_CANDIDATE_PENDING_ARTIFACT_AUTHENTICATION':'UNRESOLVED',
  reason:reasons[0]??'whole_R_line_candidate_requires_artifact_authentication_and_root_review',reasons,diagnostic,observed_line_matches_R:observedLineMatches,
  source_statement:{source_sha256:source.source_sha256,line:4,text:statement,scope:'whole_R_statement_only'},
  source_span:null,candidate_source_span:candidate?{source_sha256:source.source_sha256,line_start:4,line_end:4,text:statement,scope:'whole_R_statement',column_mapping:null}:null,
  candidate_attribution:candidate?'whole_R_statement_only':null,mapping_status:'observed_correspondence_not_verified_mapping',attribution:'none',
  applicability:{api:get?'Get':'IsNull',native_control:get?'K4-native-caller-v1':null,
   assessment:get?'same_API_different_arguments_and_error_path':'no_native_caller_control_for_IsNull',
   calibrated_sources:profile.calibrations.map(item=>({id:item.id,source_sha256:item.source_sha256,source_line:item.source_line})),
   domain_status:'observed_equal_subset_only',unknown:profile.unknown},
  calibration_projection_sha256:javascriptAttributionProfileSha256,artifact_authentication:'not_performed_by_semantic_verifier',
  input_exact:true,upstream_exact:true,output_status:'not_read_failed_execution',root_review_required:true,
  rejection_attributed:false,case_complete:false,exact_pass:false,g5_complete:false,g6_complete:false,j25_complete:false,
  public_handler_accepted:false,cli_accepted:false,general_case_sensitivity_rule:false});
}
