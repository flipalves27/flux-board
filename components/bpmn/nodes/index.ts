import { TaskNode } from "./TaskNode";
import { EventNode } from "./EventNode";
import { GatewayNode } from "./GatewayNode";
import { AnnotationNode } from "./AnnotationNode";
import { SystemBoxNode } from "./SystemBoxNode";
import { DataObjectNode } from "./DataObjectNode";
import { SwimLaneNode } from "./SwimLaneNode";

/**
 * Map of BPMN node types to React Flow custom node components.
 * Keys match BpmnNodeType values from lib/bpmn-types.ts.
 */
export const bpmnNodeTypes = {
  start_event: EventNode,
  intermediate_event: EventNode,
  timer_event: EventNode,
  message_event: EventNode,
  end_event: EventNode,
  task: TaskNode,
  user_task: TaskNode,
  service_task: TaskNode,
  script_task: TaskNode,
  call_activity: TaskNode,
  sub_process: TaskNode,
  exclusive_gateway: GatewayNode,
  parallel_gateway: GatewayNode,
  inclusive_gateway: GatewayNode,
  data_object: DataObjectNode,
  annotation: AnnotationNode,
  system_box: SystemBoxNode,
  swim_lane: SwimLaneNode,
} as const;

export { TaskNode, EventNode, GatewayNode, AnnotationNode, SystemBoxNode, DataObjectNode, SwimLaneNode };
