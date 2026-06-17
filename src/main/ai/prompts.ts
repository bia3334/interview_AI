import * as path from 'path';

/**
 * Shared math & logic formatting rules.
 * The renderer uses KaTeX/MathJax, so the delimiters must be exact — wrong
 * delimiters (square brackets, \boxed{}) silently fail to render. Kept in one
 * place so every answer style that can contain math stays consistent.
 */
const MATH_FORMATTING_RULES = `### Math & Logic Formatting (CRITICAL - READ CAREFULLY):
- **Inline math:** Use single dollar signs: $expression$
- **Display math:** Use double dollar signs: $$expression$$
- **NEVER use square brackets** like [expression] or \\[expression\\] for math. These will NOT render.
- **Derivations:** Use the aligned environment:
  $$
  \\begin{aligned}
  x &= 2y + 5 \\\\
  y &= \\frac{x-5}{2}
  \\end{aligned}
  $$
- **Logic operators:** \\land (∧), \\lor (∨), \\lnot (¬), \\to (→), \\leftrightarrow (↔)
- Use \\\\ (double backslash) for line breaks in aligned blocks.
- Do NOT use \\boxed{}, \\[...\\], or [...] for math.`;

/**
 * Generate AI prompts based on answer style and language preference
 */
export const generatePrompt = (
  answerStyle: string,
  language: string,
  question?: string,
  docContextPrefix?: string
) => {
  const basePrompt = question ? `Question: ${question}` : 'Please analyze these screenshots';

  const prompts = {
    code: `${basePrompt} and provide a solution in ${language}.

First, give a brief 3-4 line explanation of your approach (the key data structure or algorithm and why it fits). Then provide the complete code in a single ${language} code block. Use short inline comments only for non-obvious logic. End with the Time and Space complexity (e.g. Time: O(n), Space: O(1)).

If any math appears, follow these rules:
${MATH_FORMATTING_RULES}`,

    'multiple-choice': `I'm taking a multiple choice test and need the correct answer(s). ${basePrompt} and provide only the answer(s), with no explanation.

Formatting Rules:
- Output only the letter(s) of the correct answer(s), e.g. "a" or "a, c".
- Do not include explanations, reasoning, headers, or any other text.
- If multiple answers are correct, separate the letters with commas.`,

    explanation: `I need help with the following problem. ${basePrompt}

Provide a direct, concise, exam-style answer.

### Formatting Rules:
- **Style:** Write strictly as a model answer key for an exam — concise, accurate, and organized.
- **Tone:** Zero conversational filler. No "Here is the answer" or "Let's solve this."
- **Structure:** Do not use large headers (e.g., ## Explanation). Instead, use bold labels (e.g., **Given:**, **Step 1:**) or bullet points to separate logical steps.

${MATH_FORMATTING_RULES}

### Domain Specifics:
- **Multiple Choice:** Format as "**Answer: [Option]**" followed by a 1-sentence verification.
- **Algorithms:** Provide the code/pseudocode immediately. Use short inline comments (// like this) for critical logic only. State complexity (Time/Space) at the end.
- **Proofs:** Use specific steps (e.g., "Assume...", "Then...", "Therefore..."). Use \\implies or \\therefore for flow.

**Goal:** Maximum information density. Clear, scannable steps.`
  };

  const body = prompts[answerStyle as keyof typeof prompts] || prompts.explanation;
  return docContextPrefix ? `${docContextPrefix}\n\n${body}` : body;
};
/**
 * Generate prompt for extracting key information from a document
 */
export const generateKeyInfoExtractionPrompt = (fileName: string, fileContent: string) => {
  const ext = path.extname(fileName).toLowerCase();
  
  let documentType = 'document';
  if (ext === '.pdf') documentType = 'PDF document';
  else if (ext === '.docx') documentType = 'Word document';
  else if (ext === '.xlsx') documentType = 'Excel spreadsheet';
  else if (ext === '.pptx') documentType = 'PowerPoint presentation';
  else if (ext === '.md') documentType = 'Markdown document';
  else if (ext === '.txt') documentType = 'text document';
  else if (ext === '.csv') documentType = 'CSV data file';
  else if (ext === '.json') documentType = 'JSON data file';
  
  return `You are a document analyzer. Extract and summarize ALL key information from this ${documentType}.

**Document: ${fileName}**

**Your task:**
1. Identify the main topics/subjects covered
2. Extract ALL important facts, definitions, formulas, concepts, and data points
3. Note any key relationships, processes, or procedures described
4. Preserve exact values, numbers, dates, names, and technical terms
5. Maintain the structure/hierarchy of information where relevant
6. Include any examples, case studies, or illustrations mentioned

**Output Format:**
- Use clear headings and bullet points
- Group related information together
- Be comprehensive - include everything that might be useful for answering questions later
- For technical content, preserve exact formulas and terminology
- For presentations/lectures, capture the main points of each section/slide

**Important:** This summary will be used to answer questions about the document, so be thorough and accurate. Do not omit information that might seem minor - it could be important for specific questions.

--- DOCUMENT CONTENT START ---
${fileContent}
--- DOCUMENT CONTENT END ---

Now extract all key information:`;
};