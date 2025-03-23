import axios from 'axios';
import { app } from 'electron';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-sonnet-20240229';
const MAX_TOKENS = 4096;

interface Message {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: string;
    text?: string;
    source?: {
      type: string;
      media_type: string;
      data: string;
    };
  }>;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

class AnthropicClient {
  private apiKey: string | null = null;

  constructor() {
    this.loadApiKey();
  }

  private loadApiKey(): void {
    try {
      // Try to load API key from environment variable
      if (process.env.ANTHROPIC_API_KEY) {
        this.apiKey = process.env.ANTHROPIC_API_KEY;
        return;
      }

      // Try to load from global environment variable anthropic_key
      if (process.env.anthropic_key) {
        this.apiKey = process.env.anthropic_key;
        console.log('Loaded Anthropic API key from global environment variable anthropic_key');
        return;
      }
      
      console.warn('Could not find Anthropic API key in environment variables');
    } catch (error) {
      console.error('Error loading Anthropic API key:', error);
    }
  }

  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  public async generateResponse(
    messages: Message[],
    options: {
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const { maxTokens = MAX_TOKENS, temperature = 0.7, systemPrompt = '', signal } = options;

    try {
      const response = await axios.post<AnthropicResponse>(
        ANTHROPIC_API_URL,
        {
          model: MODEL,
          messages,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal,
        }
      );

      // Extract the text content from the response
      const content = response.data.content;
      if (content && content.length > 0) {
        // Combine all text blocks
        return content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
      }
      
      return '';
    } catch (error) {
      if (axios.isCancel(error)) {
        throw new Error('Request was cancelled');
      }
      
      const axiosError = error as any;
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorData = axiosError.response.data;
        
        if (status === 401) {
          throw new Error('Invalid API key');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded');
        } else {
          throw new Error(`API error (${status}): ${JSON.stringify(errorData)}`);
        }
      }
      
      throw error;
    }
  }

  public async processImages(
    imageDataList: string[],
    language: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    if (!imageDataList || imageDataList.length === 0) {
      throw new Error('No images provided');
    }

    // Create message with images
    const content: Array<{type: string, text?: string, source?: any}> = [];
    
    // Add context and instructions
    content.push({
      type: 'text',
      text: `I'm going to show you screenshots of a programming problem. Please extract and understand the problem statement, requirements, constraints, and any examples provided. The programming language being used is ${language}.`
    });
    
    // Add each image
    for (const imageData of imageDataList) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: imageData
        }
      });
    }
    
    // Add final instruction
    content.push({
      type: 'text',
      text: `Based on these screenshots, please extract and format the following information:
1. Problem title
2. Complete problem description
3. Input format
4. Output format
5. Constraints
6. Examples (with inputs and expected outputs)
7. Any additional notes or hints

Return the information in a structured JSON format that can be easily parsed.`
    });

    const messages: Message[] = [
      {
        role: 'user',
        content
      }
    ];

    const systemPrompt = 'You are an expert coding problem extractor. Your task is to accurately extract programming problems from screenshots and return them in a structured format.';
    
    try {
      const responseText = await this.generateResponse(messages, {
        ...options,
        systemPrompt
      });
      
      // Try to parse the response as JSON
      try {
        // Extract JSON from the response if there's surrounding text
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                         responseText.match(/\{[\s\S]*\}/);
        
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        // If parsing fails, return the raw text
        return { 
          title: 'Extracted Problem',
          description: responseText,
          raw_response: responseText
        };
      }
    } catch (error) {
      console.error('Error processing images:', error);
      throw error;
    }
  }

  public async generateSolution(
    problemInfo: any,
    language: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    if (!problemInfo) {
      throw new Error('No problem information provided');
    }

    // Format the problem description for the API request
    let problemText = '';
    
    if (typeof problemInfo === 'string') {
      problemText = problemInfo;
    } else {
      problemText = `
Title: ${problemInfo.title || 'Unknown Problem'}

Description:
${problemInfo.description || ''}

${problemInfo.input_format ? `Input Format:\n${problemInfo.input_format}\n` : ''}
${problemInfo.output_format ? `Output Format:\n${problemInfo.output_format}\n` : ''}
${problemInfo.constraints ? `Constraints:\n${problemInfo.constraints}\n` : ''}

${problemInfo.examples ? `Examples:\n${JSON.stringify(problemInfo.examples, null, 2)}\n` : ''}
${problemInfo.notes ? `Notes:\n${problemInfo.notes}` : ''}
`;
    }

    const messages: Message[] = [
      {
        role: 'user',
        content: `I need to solve the following coding problem in ${language}:
        
${problemText}

Please provide:
1. A detailed explanation of your approach and reasoning
2. A step-by-step solution
3. The complete code solution in ${language}
4. Time and space complexity analysis
5. Any edge cases or optimizations to consider`
      }
    ];

    const systemPrompt = `You are an expert ${language} programmer helping to solve coding problems. Provide detailed explanations and optimal solutions.`;
    
    try {
      const responseText = await this.generateResponse(messages, {
        ...options,
        systemPrompt
      });
      
      // Process and structure the response
      return {
        solution: responseText,
        language: language
      };
    } catch (error) {
      console.error('Error generating solution:', error);
      throw error;
    }
  }

  public async debugSolution(
    problemInfo: any,
    existingSolution: string,
    errorOrFailingTests: string,
    language: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Format the request
    let problemText = '';
    if (typeof problemInfo === 'string') {
      problemText = problemInfo;
    } else {
      problemText = `
Title: ${problemInfo.title || 'Unknown Problem'}

Description:
${problemInfo.description || ''}

${problemInfo.input_format ? `Input Format:\n${problemInfo.input_format}\n` : ''}
${problemInfo.output_format ? `Output Format:\n${problemInfo.output_format}\n` : ''}
${problemInfo.constraints ? `Constraints:\n${problemInfo.constraints}\n` : ''}

${problemInfo.examples ? `Examples:\n${JSON.stringify(problemInfo.examples, null, 2)}\n` : ''}
${problemInfo.notes ? `Notes:\n${problemInfo.notes}` : ''}
`;
    }

    const messages: Message[] = [
      {
        role: 'user',
        content: `I'm trying to solve this coding problem in ${language}:
        
${problemText}

My current solution is:
\`\`\`${language}
${existingSolution}
\`\`\`

I'm facing the following error or test failure:
\`\`\`
${errorOrFailingTests}
\`\`\`

Please help debug my solution by:
1. Identifying the specific issues in my code
2. Explaining what's causing the error/failure
3. Providing a corrected solution
4. Explaining your changes and why they fix the problem`
      }
    ];

    const systemPrompt = `You are an expert ${language} debugger. Help fix errors and bugs in coding solutions, explaining your reasoning clearly.`;
    
    try {
      const responseText = await this.generateResponse(messages, {
        ...options,
        systemPrompt
      });
      
      return {
        debug_solution: responseText,
        language: language
      };
    } catch (error) {
      console.error('Error debugging solution:', error);
      throw error;
    }
  }
}

export const anthropicClient = new AnthropicClient(); 