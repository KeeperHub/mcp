import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

export const listWorkflowsSchema = z.object({
  limit: z.number().optional().describe('Maximum number of workflows to return'),
  offset: z.number().optional().describe('Number of workflows to skip'),
  project_id: z.string().optional().describe('Filter workflows by project ID'),
  tag_id: z.string().optional().describe('Filter workflows by tag ID'),
});

export const getWorkflowSchema = z.object({
  workflow_id: z.string().describe('The ID of the workflow to retrieve'),
});

export const createWorkflowSchema = z.object({
  name: z.string().describe('Name of the workflow'),
  description: z.string().optional().describe('Optional description'),
  project_id: z.string().optional().nullable().describe('Project ID to assign the workflow to'),
  tag_id: z.string().optional().nullable().describe('Tag ID to assign to the workflow'),
  nodes: z.array(WorkflowNodeSchema).optional().describe('Workflow nodes'),
  edges: z.array(WorkflowEdgeSchema).optional().describe('Workflow edges'),
});

export const updateWorkflowSchema = z.object({
  workflow_id: z.string().describe('The ID of the workflow to update'),
  name: z.string().optional().describe('New name for the workflow'),
  description: z.string().optional().describe('New description'),
  enabled: z.boolean().optional().describe('Enable or disable the workflow (true = active, false = paused)'),
  project_id: z.string().optional().nullable().describe('Project ID to assign the workflow to (null to unassign)'),
  tag_id: z.string().optional().nullable().describe('Tag ID to assign to the workflow (null to unassign)'),
  nodes: z.array(WorkflowNodeSchema).optional().describe('Updated workflow nodes'),
  edges: z.array(WorkflowEdgeSchema).optional().describe('Updated workflow edges'),
});

export const deleteWorkflowSchema = z.object({
  workflow_id: z.string().describe('The ID of the workflow to delete'),
  force: z.boolean().optional().describe('Force delete even if the workflow has execution history. This will permanently delete all runs and logs.'),
});

/**
 * Field name corrections for common mistakes.
 * Maps wrong field names to correct ones based on action type.
 */
const ACTION_FIELD_CORRECTIONS: Record<string, Record<string, string>> = {
  // Condition action
  Condition: {
    conditionExpression: 'condition',
    expression: 'condition',
  },
  // HTTP Request action
  'HTTP Request': {
    url: 'endpoint',
    method: 'httpMethod',
    headers: 'httpHeaders',
    body: 'httpBody',
  },
  // Webhook action
  'webhook/send-webhook': {
    url: 'webhookUrl',
    endpoint: 'webhookUrl',
    method: 'webhookMethod',
    headers: 'webhookHeaders',
    body: 'webhookPayload',
    payload: 'webhookPayload',
  },
  // Discord action
  'discord/send-message': {
    message: 'discordMessage',
    content: 'discordMessage',
  },
  // SendGrid action
  'sendgrid/send-email': {
    to: 'emailTo',
    subject: 'emailSubject',
    body: 'emailBody',
    email: 'emailTo',
    recipient: 'emailTo',
  },
  // Web3 actions
  'web3/check-balance': {
    chainId: 'network',
  },
  'web3/check-token-balance': {
    chainId: 'network',
    tokenAddress: 'tokenConfig',
  },
  'web3/transfer-funds': {
    chainId: 'network',
    to: 'recipientAddress',
    toAddress: 'recipientAddress',
  },
  'web3/transfer-token': {
    chainId: 'network',
    to: 'recipientAddress',
    toAddress: 'recipientAddress',
    tokenAddress: 'tokenConfig',
  },
  'web3/read-contract': {
    chainId: 'network',
    contract: 'contractAddress',
    function: 'abiFunction',
    functionName: 'abiFunction',
    args: 'functionArgs',
  },
  'web3/write-contract': {
    chainId: 'network',
    contract: 'contractAddress',
    function: 'abiFunction',
    functionName: 'abiFunction',
    args: 'functionArgs',
  },
  // Database Query action
  'Database Query': {
    query: 'dbQuery',
    schema: 'dbSchema',
  },
};

/**
 * Trigger field name corrections for common mistakes.
 * Maps wrong field names to correct ones based on trigger type.
 */
const TRIGGER_FIELD_CORRECTIONS: Record<string, Record<string, string>> = {
  // Schedule trigger
  Schedule: {
    schedule: 'scheduleCron',
    cron: 'scheduleCron',
    cronExpression: 'scheduleCron',
    timezone: 'scheduleTimezone',
  },
  // Event trigger
  Event: {
    chainId: 'network',
    contract: 'contractAddress',
    abi: 'contractABI',
    event: 'eventName',
  },
};

/**
 * Correct triggerType capitalization.
 * The UI expects specific casing for trigger types.
 */
const TRIGGER_TYPE_CORRECTIONS: Record<string, string> = {
  schedule: 'Schedule',
  manual: 'Manual',
  webhook: 'Webhook',
  event: 'Event',
};

// Layout constants for auto-positioning nodes
const LAYOUT = {
  NODE_WIDTH: 200,
  NODE_HEIGHT: 100,
  HORIZONTAL_GAP: 100, // Gap between columns
  VERTICAL_GAP: 50, // Gap between nodes in same column
  START_X: 0,
  START_Y: 200,
};

/**
 * Auto-layouts workflow nodes horizontally (left-to-right) based on edge connections.
 * Nodes are positioned in columns based on their depth from the root (trigger) node.
 * Sibling nodes (same parent) are spread vertically.
 */
function autoLayoutNodes(
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined,
  edges: z.infer<typeof WorkflowEdgeSchema>[] | undefined
): z.infer<typeof WorkflowNodeSchema>[] | undefined {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }

  // Build adjacency list from edges
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges ?? []) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);

    if (!parentMap.has(edge.target)) {
      parentMap.set(edge.target, []);
    }
    parentMap.get(edge.target)!.push(edge.source);
  }

  // Find root nodes (no incoming edges)
  const rootNodes = nodes.filter((n) => !parentMap.has(n.id) || parentMap.get(n.id)!.length === 0);

  // BFS to assign depths (columns)
  const nodeDepths = new Map<string, number>();
  const queue: { id: string; depth: number }[] = rootNodes.map((n) => ({ id: n.id, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) {
      // Update depth if we found a longer path
      if (depth > (nodeDepths.get(id) ?? 0)) {
        nodeDepths.set(id, depth);
      }
      continue;
    }
    visited.add(id);
    nodeDepths.set(id, depth);

    const children = childrenMap.get(id) ?? [];
    for (const childId of children) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  // Handle any disconnected nodes
  for (const node of nodes) {
    if (!nodeDepths.has(node.id)) {
      nodeDepths.set(node.id, 0);
    }
  }

  // Group nodes by depth (column)
  const columns = new Map<number, string[]>();
  for (const [nodeId, depth] of nodeDepths) {
    if (!columns.has(depth)) {
      columns.set(depth, []);
    }
    columns.get(depth)!.push(nodeId);
  }

  // Calculate positions
  const nodePositions = new Map<string, { x: number; y: number }>();
  const columnWidth = LAYOUT.NODE_WIDTH + LAYOUT.HORIZONTAL_GAP;

  for (const [depth, nodeIdsInColumn] of columns) {
    const x = LAYOUT.START_X + depth * columnWidth;
    const totalHeight = nodeIdsInColumn.length * (LAYOUT.NODE_HEIGHT + LAYOUT.VERTICAL_GAP) - LAYOUT.VERTICAL_GAP;
    const startY = LAYOUT.START_Y - totalHeight / 2 + LAYOUT.NODE_HEIGHT / 2;

    nodeIdsInColumn.forEach((nodeId, index) => {
      const y = startY + index * (LAYOUT.NODE_HEIGHT + LAYOUT.VERTICAL_GAP);
      nodePositions.set(nodeId, { x, y });
    });
  }

  // Apply positions to nodes
  return nodes.map((node) => {
    const position = nodePositions.get(node.id);
    if (position) {
      return { ...node, position };
    }
    return node;
  });
}

/**
 * Checks if nodes need auto-layout (missing, overlapping, or vertical positions).
 * Workflows should flow left-to-right (horizontal), not top-to-bottom (vertical).
 */
function needsAutoLayout(nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined): boolean {
  if (!nodes || nodes.length === 0) {
    return false;
  }

  // Check if any node is missing position
  const hasMissingPositions = nodes.some((n) => !n.position);
  if (hasMissingPositions) {
    return true;
  }

  // Check for overlapping or poorly spaced nodes (all at same x or y)
  const positions = nodes.map((n) => n.position!);
  const uniqueX = new Set(positions.map((p) => p.x));
  const uniqueY = new Set(positions.map((p) => p.y));

  // If all nodes are in a single column (same x) or single row (same y) with >2 nodes, re-layout
  if (nodes.length > 2 && (uniqueX.size === 1 || uniqueY.size === 1)) {
    return true;
  }

  // Detect vertical layouts (top-to-bottom flow) and convert to horizontal (left-to-right)
  // Calculate spread in x and y directions
  const xValues = positions.map((p) => p.x);
  const yValues = positions.map((p) => p.y);
  const xSpread = Math.max(...xValues) - Math.min(...xValues);
  const ySpread = Math.max(...yValues) - Math.min(...yValues);

  // If vertical spread is greater than horizontal spread, it's a vertical layout - re-layout to horizontal
  if (nodes.length > 1 && ySpread > xSpread) {
    return true;
  }

  return false;
}

/**
 * Validates that all edges reference existing node IDs.
 * Returns warnings for any orphaned edges.
 */
function validateEdges(
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined,
  edges: z.infer<typeof WorkflowEdgeSchema>[] | undefined
): string[] {
  if (!edges || edges.length === 0) {
    return [];
  }

  const nodeIds = new Set(nodes?.map((n) => n.id) ?? []);
  const warnings: string[] = [];

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      warnings.push(
        `Edge "${edge.id}": source "${edge.source}" does not exist in nodes`
      );
    }
    if (!nodeIds.has(edge.target)) {
      warnings.push(
        `Edge "${edge.id}": target "${edge.target}" does not exist in nodes`
      );
    }
  }

  return warnings;
}

/**
 * Validates Condition node usage and returns warnings for common mistakes.
 * Condition nodes support two valid patterns:
 * 1. Single outgoing edge (gate): only passes through when condition is TRUE.
 * 2. Two edges with sourceHandle "true" and "false" (if/else): routes to different paths.
 *
 * AVOID: parallel fan-out from a non-Condition node to two separate Condition nodes with
 * opposite expressions. This causes a race condition — one branch always produces a dead end,
 * leading to intermittent run errors.
 */
function validateConditionNodes(
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined,
  edges: z.infer<typeof WorkflowEdgeSchema>[] | undefined
): string[] {
  if (!nodes || !edges || edges.length === 0) {
    return [];
  }

  const warnings: string[] = [];

  // Find all Condition nodes
  const conditionNodeIds = new Set<string>();
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const config = data.config as Record<string, unknown> | undefined;
    if (config?.actionType === 'Condition') {
      conditionNodeIds.add(node.id);
    }
  }

  // Collect outgoing edges per Condition node
  const outgoingEdges = new Map<string, z.infer<typeof WorkflowEdgeSchema>[]>();
  for (const edge of edges) {
    if (conditionNodeIds.has(edge.source)) {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge);
    }
  }

  for (const [nodeId, nodeEdges] of outgoingEdges) {
    if (nodeEdges.length <= 1) {
      // Single outgoing edge — valid gate pattern
      continue;
    }

    if (nodeEdges.length === 2) {
      const handles = nodeEdges.map((e) => e.sourceHandle);
      if (handles.includes('true') && handles.includes('false')) {
        // Valid if/else split — one true path, one false path
        continue;
      }
    }

    // Anything else is invalid
    warnings.push(
      `WARNING: Condition node "${nodeId}" has ${nodeEdges.length} outgoing edges without a valid true/false split. ` +
      `Condition nodes support two patterns:\n` +
      `  1. Single edge (gate) — passes through only when condition is TRUE\n` +
      `  2. Two edges with sourceHandle "true" and "false" (if/else) — routes to separate paths\n` +
      `Multiple edges without distinct true/false handles cause race conditions and intermittent run errors.`
    );
  }

  return warnings;
}

/**
 * Ensures nodes have required data fields for the UI to render properly.
 * The KeeperHub UI requires these fields in node.data:
 * - type: "trigger" or "action" (tells UI how to render the node)
 * - status: "idle" (needed for UI state management)
 * - description: shown under node label in the canvas
 *
 * Without these fields, the right-side drawer panel won't appear when clicking nodes.
 */
function ensureNodeDataFields(
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined
): { nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined; corrections: string[] } {
  if (!nodes) {
    return { nodes: undefined, corrections: [] };
  }

  const corrections: string[] = [];

  const result = nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    const config = data.config as Record<string, unknown> | undefined;
    const label = data.label as string | undefined;

    // Auto-correct node.type if it's not "trigger" or "action"
    let correctedNodeType = node.type;
    if (node.type !== 'trigger' && node.type !== 'action') {
      if (config?.triggerType) {
        correctedNodeType = 'trigger';
      } else {
        correctedNodeType = 'action';
      }
      corrections.push(
        `Node "${node.id}": Corrected node.type from "${node.type}" to "${correctedNodeType}" (node.type must be "trigger" or "action")`
      );
    }

    // Determine node type from node.type field
    const nodeType = correctedNodeType === 'trigger' ? 'trigger' : 'action';

    // Generate default description if missing
    let description = data.description as string | undefined;
    if (!description && label) {
      // Generate a sensible description based on action type or label
      const actionType = config?.actionType as string | undefined;
      if (actionType === 'web3/check-balance') {
        description = `Check wallet ETH balance`;
      } else if (actionType === 'Condition') {
        description = `Evaluate condition`;
      } else if (actionType === 'webhook/send-webhook') {
        description = `Send webhook request`;
      } else if (actionType === 'discord/send-message') {
        description = `Send Discord message`;
      } else if (actionType === 'sendgrid/send-email') {
        description = `Send email via SendGrid`;
      } else if (node.type === 'trigger') {
        const triggerType = config?.triggerType as string | undefined;
        if (triggerType === 'Schedule') {
          description = `Scheduled trigger`;
        } else if (triggerType === 'Event') {
          description = `Blockchain event trigger`;
        } else if (triggerType === 'Webhook') {
          description = `Webhook trigger`;
        } else {
          description = `Manual trigger`;
        }
      } else {
        description = label;
      }
    }

    // Only update if fields are missing or node.type needs correction
    const needsNodeTypeCorrection = correctedNodeType !== node.type;
    const needsUpdate =
      needsNodeTypeCorrection ||
      data.type !== nodeType ||
      data.status === undefined ||
      (data.description === undefined && description);

    if (!needsUpdate) {
      return node;
    }

    return {
      ...node,
      ...(needsNodeTypeCorrection ? { type: correctedNodeType } : {}),
      data: {
        ...data,
        type: nodeType,
        status: data.status ?? 'idle',
        ...(description && !data.description ? { description } : {}),
      },
    };
  });

  return { nodes: result, corrections };
}

/**
 * Normalizes node configs by correcting common field name mistakes.
 * Returns the corrected nodes and a list of corrections made.
 * Handles both action nodes and trigger nodes:
 * - Fixes triggerType capitalization (e.g., "schedule" -> "Schedule")
 * - Fixes trigger field names (e.g., "schedule" -> "scheduleCron")
 * - Fixes action field names (e.g., "url" -> "webhookUrl")
 */
function normalizeNodeConfigs(
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined
): {
  nodes: z.infer<typeof WorkflowNodeSchema>[] | undefined;
  corrections: string[];
} {
  if (!nodes) {
    return { nodes: undefined, corrections: [] };
  }

  const corrections: string[] = [];

  const normalizedNodes = nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    const config = data.config as Record<string, unknown> | undefined;

    if (!config) {
      return node;
    }

    const newConfig = { ...config };
    let hasCorrections = false;

    // Handle trigger nodes
    if (node.type === 'trigger') {
      const triggerType = config.triggerType as string | undefined;
      if (triggerType) {
        // Fix triggerType capitalization (e.g., "schedule" -> "Schedule")
        const correctedTriggerType = TRIGGER_TYPE_CORRECTIONS[triggerType.toLowerCase()];
        if (correctedTriggerType && correctedTriggerType !== triggerType) {
          newConfig.triggerType = correctedTriggerType;
          corrections.push(
            `Node "${node.id}": Corrected triggerType "${triggerType}" to "${correctedTriggerType}"`
          );
          hasCorrections = true;
        }

        // Fix trigger field names
        const normalizedTriggerType = correctedTriggerType ?? triggerType;
        const fieldCorrections = TRIGGER_FIELD_CORRECTIONS[normalizedTriggerType];
        if (fieldCorrections) {
          for (const [wrongField, correctField] of Object.entries(fieldCorrections)) {
            if (wrongField in newConfig && !(correctField in newConfig)) {
              newConfig[correctField] = newConfig[wrongField];
              delete newConfig[wrongField];
              corrections.push(
                `Node "${node.id}": Corrected "${wrongField}" to "${correctField}" for ${normalizedTriggerType} trigger`
              );
              hasCorrections = true;
            }
          }
        }
      }
    }

    // Handle action nodes
    const actionType = config.actionType as string | undefined;
    if (actionType) {
      const fieldCorrections = ACTION_FIELD_CORRECTIONS[actionType];
      if (fieldCorrections) {
        for (const [wrongField, correctField] of Object.entries(fieldCorrections)) {
          if (wrongField in newConfig && !(correctField in newConfig)) {
            newConfig[correctField] = newConfig[wrongField];
            delete newConfig[wrongField];
            corrections.push(
              `Node "${node.id}": Corrected "${wrongField}" to "${correctField}" for ${actionType}`
            );
            hasCorrections = true;
          }
        }
      }
    }

    if (hasCorrections) {
      return {
        ...node,
        data: {
          ...data,
          config: newConfig,
        },
      };
    }

    return node;
  });

  return { nodes: normalizedNodes, corrections };
}

export async function handleListWorkflows(
  client: KeeperHubClient,
  args: z.infer<typeof listWorkflowsSchema>
) {
  const workflows = await client.listWorkflows({
    limit: args.limit,
    offset: args.offset,
    projectId: args.project_id,
    tagId: args.tag_id,
  });

  // Return summary without nodes/edges to reduce response size
  // Use get_workflow for full details of a specific workflow
  const summary = workflows.map(({ nodes, edges, ...rest }) => ({
    ...rest,
    nodeCount: nodes?.length ?? 0,
    edgeCount: edges?.length ?? 0,
  }));

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}

export async function handleGetWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof getWorkflowSchema>
) {
  const workflow = await client.getWorkflow(args.workflow_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(workflow, null, 2),
      },
    ],
  };
}

export async function handleCreateWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof createWorkflowSchema>
) {
  // Normalize node configs to fix common field name mistakes
  const { nodes: normalizedNodes, corrections } = normalizeNodeConfigs(args.nodes);

  // Ensure nodes have required UI fields (type, status, description)
  const { nodes: nodesWithUIFields, corrections: nodeTypeCorrections } = ensureNodeDataFields(normalizedNodes);
  corrections.push(...nodeTypeCorrections);

  // Validate edges reference existing nodes
  const edgeWarnings = validateEdges(nodesWithUIFields, args.edges);
  if (edgeWarnings.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `ERROR: Invalid edges detected. Please fix before creating workflow:\n${edgeWarnings.join('\n')}\n\nTip: Use get_workflow first to see existing node IDs when updating.`,
        },
      ],
    };
  }

  // Validate Condition node usage
  const conditionWarnings = validateConditionNodes(nodesWithUIFields, args.edges);
  if (conditionWarnings.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `ERROR: Invalid Condition node usage detected:\n${conditionWarnings.join('\n')}\n\nUse a single Condition node with sourceHandle "true" → action-A and sourceHandle "false" → action-B for if/else logic.`,
        },
      ],
    };
  }

  // Auto-layout nodes if positions are missing or poorly arranged
  const layoutedNodes = needsAutoLayout(nodesWithUIFields)
    ? autoLayoutNodes(nodesWithUIFields, args.edges)
    : nodesWithUIFields;

  const workflow = await client.createWorkflow({
    name: args.name,
    description: args.description,
    projectId: args.project_id,
    tagId: args.tag_id,
    nodes: layoutedNodes,
    edges: args.edges,
  });

  // Include corrections in the response if any were made
  const responseText = corrections.length > 0
    ? `Auto-corrected field names:\n${corrections.join('\n')}\n\nWorkflow created:\n${JSON.stringify(workflow, null, 2)}`
    : JSON.stringify(workflow, null, 2);

  return {
    content: [
      {
        type: 'text' as const,
        text: responseText,
      },
    ],
  };
}

export async function handleUpdateWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof updateWorkflowSchema>
) {
  const { workflow_id, ...updateData } = args;

  // Normalize node configs to fix common field name mistakes
  const { nodes: normalizedNodes, corrections } = normalizeNodeConfigs(updateData.nodes);

  // Ensure nodes have required UI fields (type, status, description)
  const { nodes: nodesWithUIFields, corrections: nodeTypeCorrections } = ensureNodeDataFields(normalizedNodes);
  corrections.push(...nodeTypeCorrections);

  // Validate edges reference existing nodes
  const edgeWarnings = validateEdges(nodesWithUIFields, updateData.edges);
  if (edgeWarnings.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `ERROR: Invalid edges detected. Please fix before updating workflow:\n${edgeWarnings.join('\n')}\n\nTip: Use get_workflow first to see existing node IDs.`,
        },
      ],
    };
  }

  // Validate Condition node usage
  const conditionWarnings = validateConditionNodes(nodesWithUIFields, updateData.edges);
  if (conditionWarnings.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `ERROR: Invalid Condition node usage detected:\n${conditionWarnings.join('\n')}\n\nUse a single Condition node with sourceHandle "true" → action-A and sourceHandle "false" → action-B for if/else logic.`,
        },
      ],
    };
  }

  // Auto-layout nodes if positions are missing or poorly arranged
  const layoutedNodes = needsAutoLayout(nodesWithUIFields)
    ? autoLayoutNodes(nodesWithUIFields, updateData.edges)
    : nodesWithUIFields;

  const workflow = await client.updateWorkflow({
    workflowId: workflow_id,
    name: updateData.name,
    description: updateData.description,
    enabled: updateData.enabled,
    projectId: args.project_id,
    tagId: args.tag_id,
    nodes: layoutedNodes,
    edges: updateData.edges,
  });

  // Include corrections in the response if any were made
  const responseText = corrections.length > 0
    ? `Auto-corrected field names:\n${corrections.join('\n')}\n\nWorkflow updated:\n${JSON.stringify(workflow, null, 2)}`
    : JSON.stringify(workflow, null, 2);

  return {
    content: [
      {
        type: 'text' as const,
        text: responseText,
      },
    ],
  };
}

export async function handleDeleteWorkflow(
  client: KeeperHubClient,
  args: z.infer<typeof deleteWorkflowSchema>
) {
  await client.deleteWorkflow(args.workflow_id, { force: args.force });
  const suffix = args.force ? ' (force deleted with all execution history)' : '';
  return {
    content: [
      {
        type: 'text' as const,
        text: `Workflow ${args.workflow_id} deleted successfully${suffix}`,
      },
    ],
  };
}
