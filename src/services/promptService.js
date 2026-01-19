const fs = require('fs').promises;
const path = require('path');

/**
 * Service for managing prompt templates
 */
class PromptService {
  constructor() {
    this.prompts = null;
    this.promptsPath = path.join(__dirname, '../../data/prompts.json');
  }

  /**
   * Load prompts from prompts.json file
   * @returns {Promise<Object>} Prompts configuration
   */
  async loadPrompts() {
    if (this.prompts) {
      return this.prompts;
    }

    try {
      const data = await fs.readFile(this.promptsPath, 'utf8');
      this.prompts = JSON.parse(data);
      return this.prompts;
    } catch (error) {
      throw new Error(`Failed to load prompts: ${error.message}`);
    }
  }

  /**
   * Get a prompt by ID
   * @param {string} promptId - The prompt ID to retrieve
   * @returns {Promise<Object|null>} The prompt object or null if not found
   */
  async getPromptById(promptId) {
    const prompts = await this.loadPrompts();
    
    if (!prompts.prompts || !Array.isArray(prompts.prompts)) {
      throw new Error('Invalid prompts.json structure');
    }

    const prompt = prompts.prompts.find(p => p.id === promptId);
    return prompt || null;
  }

  /**
   * Get all available prompts
   * @returns {Promise<Array>} List of all prompts
   */
  async getPrompts() {
    const prompts = await this.loadPrompts();
    
    if (!prompts.prompts || !Array.isArray(prompts.prompts)) {
      throw new Error('Invalid prompts.json structure');
    }

    return prompts.prompts;
  }

  /**
   * Resolve a prompt template with variables
   * @param {string} template - The prompt template with {{variable}} placeholders
   * @param {Object} variables - Variables to substitute in the template
   * @param {Object} defaultVariables - Default values for optional variables
   * @returns {string} Resolved prompt text
   */
  resolveTemplate(template, variables = {}, defaultVariables = {}) {
    // Merge provided variables with defaults
    const allVariables = { ...defaultVariables, ...variables };

    // Replace {{variable}} placeholders with actual values
    let resolved = template;
    for (const [key, value] of Object.entries(allVariables)) {
      // replaceAll ensures all instances are replaced
      // Using a function () => value prevents special replacement patterns (like $&) in value from being interpreted
      resolved = resolved.replaceAll(`{{${key}}}`, () => value);
    }

    return resolved;
  }

  /**
   * Validate that required variables are provided
   * @param {Object} prompt - The prompt object
   * @param {Object} variables - Variables provided by the user
   * @throws {Error} If required variables are missing
   */
  validateVariables(prompt, variables = {}) {
    if (!prompt.requiredVariables || prompt.requiredVariables.length === 0) {
      return;
    }

    const missingVariables = prompt.requiredVariables.filter(
      varName => !(varName in variables)
    );

    if (missingVariables.length > 0) {
      throw new Error(
        `Missing required variables: ${missingVariables.join(', ')}`
      );
    }
  }

  /**
   * Validate that the expected outcome is supported by the prompt
   * @param {Object} prompt - The prompt object
   * @param {string} expectedOutcome - The expected outcome type ('text' or 'image')
   * @throws {Error} If the outcome is not supported
   */
  validateOutcome(prompt, expectedOutcome) {
    if (!prompt.supportedOutcomes || !Array.isArray(prompt.supportedOutcomes)) {
      throw new Error('Prompt does not specify supported outcomes');
    }

    if (!prompt.supportedOutcomes.includes(expectedOutcome)) {
      throw new Error(
        `Prompt '${prompt.id}' does not support outcome type '${expectedOutcome}'. ` +
        `Supported outcomes: ${prompt.supportedOutcomes.join(', ')}`
      );
    }
  }

  /**
   * Get and resolve a prompt with validation
   * @param {string} promptId - The prompt ID
   * @param {Object} variables - Variables to substitute
   * @param {string} expectedOutcome - Expected outcome type
   * @returns {Promise<Object>} Object with resolved prompt and metadata
   */
  async getResolvedPrompt(promptId, variables = {}, expectedOutcome) {
    const prompt = await this.getPromptById(promptId);

    if (!prompt) {
      throw new Error(`Prompt with ID '${promptId}' not found`);
    }

    // Validate variables and outcome
    this.validateVariables(prompt, variables);
    this.validateOutcome(prompt, expectedOutcome);

    // Resolve the template
    const resolvedPrompt = this.resolveTemplate(
      prompt.template,
      variables,
      prompt.defaultVariables
    );

    return {
      prompt: resolvedPrompt,
      metadata: {
        promptId: prompt.id,
        name: prompt.name,
        description: prompt.description
      }
    };
  }

  /**
   * Reload prompts from file (useful for development)
   */
  async reloadPrompts() {
    this.prompts = null;
    return this.loadPrompts();
  }
}

// Export singleton instance
module.exports = new PromptService();
