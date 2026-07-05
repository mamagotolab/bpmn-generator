export const NODE_TYPES = ['start', 'task', 'gateway', 'end'];

/**
 * @typedef {'start'|'task'|'gateway'|'end'} FlowNodeType
 *
 * @typedef {object} FlowNode
 * @property {string} id
 * @property {FlowNodeType} type
 * @property {string} label
 * @property {string} lane
 *
 * @typedef {object} FlowEdge
 * @property {string} from
 * @property {string} to
 * @property {string} label
 *
 * @typedef {object} Flow
 * @property {FlowNode[]} nodes
 * @property {FlowEdge[]} edges
 */

export const FLOW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodes', 'edges'],
  properties: {
    nodes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'label', 'lane'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: NODE_TYPES },
          label: { type: 'string' },
          lane: { type: 'string', minLength: 1 }
        }
      }
    },
    edges: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', minLength: 1 },
          to: { type: 'string', minLength: 1 },
          label: { type: 'string' }
        }
      }
    }
  }
};
