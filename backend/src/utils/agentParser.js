/**
 * Parser for Agent 1 Markdown output.
 * 
 * DEPRECATED: Agent 1 now returns structured JSON directly.
 * This parser is kept as a fallback for backward compatibility.
 *
 * Input: Markdown text from Agent 1
 * Output: Structured JSON
 *
 * Expected Markdown format:
 *   ### Flow 1: Tên Flow
 *   **Source**: Category > Subcategory
 *   **Steps**:
 *   1. Step one
 *   2. Step two
 */

/**
 * @typedef {Object} ParsedFlow
 * @property {string} flowName
 * @property {string} source
 * @property {string[]} steps
 */

/**
 * @typedef {Object} ParsedAgent1Output
 * @property {string[]} flows
 * @property {string} rawMarkdown
 */

/**
 * Parse Agent 1 markdown output into structured JSON.
 * @param {string} markdown - Raw markdown from Agent 1
 * @returns {{ flows: ParsedFlow[], rawMarkdown: string }}
 */
function parseAgent1Output(markdown) {
  const flows = [];

  // Split by flow headers: "## Flow N:" or "### Flow N:"
  const flowRegex = /^#{2,3}\s+Flow\s+\d+[:\s]+(.+)$/gm;
  const sections = [];

  let match;
  const allMatches = [];
  while ((match = flowRegex.exec(markdown)) !== null) {
    allMatches.push({ index: match.index, name: match[1].trim(), fullMatch: match[0] });
  }

  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i];
    const next = allMatches[i + 1];
    const sectionText = markdown.substring(current.index, next ? next.index : markdown.length);

    const flow = parseFlowSection(sectionText, current.name);
    if (flow) flows.push(flow);
  }

  return { flows, rawMarkdown: markdown };
}

/**
 * Parse a single flow section.
 * @param {string} text
 * @param {string} fallbackName
 * @returns {ParsedFlow | null}
 */
function parseFlowSection(text, fallbackName) {
  // Extract Source: **Source**: Category > Subcategory  OR  **Source:** Category
  const sourceMatch = text.match(/\*\*Source\*\*[:\s]+(.+?)(?:\r?\n|$)/i) ||
                       text.match(/\*\*Source[:\s]+\*\*[:\s]+(.+?)(?:\r?\n|$)/i);
  const source = sourceMatch ? sourceMatch[1].trim() : '';

  // Extract Steps: numbered list under **Steps**:
  const steps = [];
  const stepRegex = /^\d+\.\s+(.+)$/gm;
  let match;
  while ((match = stepRegex.exec(text)) !== null) {
    steps.push(match[1].trim());
  }

  if (steps.length === 0) return null;

  return {
    flowName: fallbackName.replace(/^Flow\s+\d+[:\s]*/i, '').trim() || fallbackName,
    source,
    steps,
  };
}

module.exports = { parseAgent1Output };
