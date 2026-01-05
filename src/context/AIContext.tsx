import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { usePortfolio } from '../hooks/usePortfolio';
import { useDividends } from '../hooks/useDividends';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface AIContextType {
    messages: Message[];
    isLoading: boolean;
    initProgress: string;
    isModelLoaded: boolean;
    currentModel: string;
    sendMessage: (content: string) => Promise<void>;
    clearMessages: () => void;
    clearChat: () => void;
    loadModel: (modelId: string) => Promise<void>;
    changeModel: (modelId: string) => Promise<void>;
}

interface AIProviderProps {
    children: ReactNode;
}

const AIContext = createContext<AIContextType | null>(null);

export const AIProvider: React.FC<AIProviderProps> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [initProgress, setInitProgress] = useState('');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [currentModel, setCurrentModel] = useState(localStorage.getItem('selected_llm_model') || "Qwen3-1.7B-q4f16_1-MLC");
    const engine = useRef<any>(null);

    const { portfolioSummary, assets, transactions, watchlist } = usePortfolio();
    const { ytdTotal, upcoming60Days, yieldOnCost, monthlyAverage, calendar } = useDividends();

    const portfolioDataRef = useRef({
        portfolioSummary,
        assets,
        transactions,
        watchlist,
        dividends: { ytdTotal, upcoming60Days, yieldOnCost, monthlyAverage, calendar }
    });

    useEffect(() => {
        portfolioDataRef.current = {
            portfolioSummary,
            assets,
            transactions,
            watchlist,
            dividends: { ytdTotal, upcoming60Days, yieldOnCost, monthlyAverage, calendar }
        };
    }, [portfolioSummary, assets, transactions, watchlist, ytdTotal, upcoming60Days, yieldOnCost, monthlyAverage, calendar]);

    const loadModel = async (modelId: string) => {
        try {
            if (engine.current) {
                await engine.current.unload();
                setInitProgress('Reloading Engine...');
            } else {
                setInitProgress('Initializing Engine...');
            }

            setIsModelLoaded(false);

            const disableAI = import.meta.env.VITE_DISABLE_AI === 'true';
            if (disableAI) {
                setInitProgress('');
                setIsModelLoaded(false);
                return;
            }

            const engineConfig: any = {
                initProgressCallback: (progress: any) => {
                    setInitProgress(progress.text);
                },
            };

            const customModels: any[] = [
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
                    "model_id": "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 1629,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC",
                    "model_id": "Qwen2.5-7B-Instruct-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2-7B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 4650,
                    "low_resource_required": false,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
                    "model_id": "Llama-3.2-1B-Instruct-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 879,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC",
                    "model_id": "Llama-3.2-3B-Instruct-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 2263,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC",
                    "model_id": "gemma-2-2b-it-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 1583,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Phi-3.5-mini-instruct-q4f16_1-MLC",
                    "model_id": "Phi-3.5-mini-instruct-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 2520,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
                    "model_id": "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Mistral-7B-Instruct-v0.3-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 4573,
                    "low_resource_required": false,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC",
                    "model_id": "Qwen3-0.6B-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen3-0.6B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 1403,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC",
                    "model_id": "Qwen3-1.7B-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen3-1.7B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 2036,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC",
                    "model_id": "Qwen3-4B-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen3-4B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 3431,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/Qwen3-8B-q4f16_1-MLC",
                    "model_id": "Qwen3-8B-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen3-8B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 5695,
                    "low_resource_required": false,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/gemma-3-1b-it-q4f32_1-MLC",
                    "model_id": "gemma-3-1b-it-q4f32_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 1500,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/gemma-3-4b-it-q4f32_1-MLC",
                    "model_id": "gemma-3-4b-it-q4f32_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 3000,
                    "low_resource_required": true,
                },
            ];

            engineConfig.appConfig = { model_list: customModels };
            const newEngine = await CreateMLCEngine(modelId, engineConfig);
            engine.current = newEngine;

            setIsModelLoaded(true);
            setCurrentModel(modelId);
            localStorage.setItem('selected_llm_model', modelId);
            setInitProgress('');
        } catch (e: any) {
            console.error("Failed to load model:", e);
            setInitProgress(`Error: ${e?.message || 'Unknown error'}`);
            setIsModelLoaded(false);
        }
    };

    useEffect(() => {
        loadModel(currentModel);
    }, []);

    const sendMessage = async (content: string) => {
        if (!engine.current || !isModelLoaded) {
            console.warn("Model not loaded");
            return;
        }

        const userMessage: Message = { role: 'user', content };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            const portfolioData = portfolioDataRef.current;
            const { portfolioSummary: summary, assets, transactions, watchlist, dividends } = portfolioData;

            // Build comprehensive portfolio context
            const portfolioContext = `
=== PORTFOLIO SUMMARY ===
Total Value: ${summary?.totalValue || 'N/A'} ${summary?.baseCurrency || 'PLN'}
Total P/L: ${summary?.totalPL || 'N/A'} (${summary?.totalPLPercent || 'N/A'})
Cash Balance: ${summary?.cash || 'N/A'} ${summary?.baseCurrency || 'PLN'}
Number of Assets: ${assets?.length || 0}

=== ASSETS DETAILS ===
${assets?.map((a: any) => `${a.ticker}: ${a.amount} shares @ ${a.avgPrice?.toFixed(2)} ${a.currency}
  Current Price: ${a.price !== null ? a.price.toFixed(2) : 'N/A'} ${a.currency}
  Value: ${a.value} ${a.currency}
  P/L: ${a.pl}`).join('\n') || 'No assets'}

=== CURRENCY BREAKDOWN ===
${summary?.breakdown?.map((b: any) => `${b.currency}: ${b.value.toFixed(2)} (P/L: ${b.pl >= 0 ? '+' : ''}${b.pl.toFixed(2)})`).join(', ') || 'N/A'}

=== RECENT TRANSACTIONS (Last 30) ===
${transactions?.slice(0, 30).map((t: any) => `${t.date}: ${t.type.toUpperCase()} ${t.ticker || 'CASH'} ${t.amount ? `- ${t.amount} @ ${t.price} ${t.currency}` : `- ${t.price} ${t.currency}`}`).join('\n') || 'No transactions'}

=== DIVIDEND STATISTICS ===
YTD Total Received: ${dividends?.ytdTotal?.toFixed(2) || '0'} PLN
Upcoming (60 days): ${dividends?.upcoming60Days?.toFixed(2) || '0'} PLN
Yield on Cost: ${dividends?.yieldOnCost?.toFixed(2) || '0'}%
Monthly Average: ${dividends?.monthlyAverage?.toFixed(2) || '0'} PLN

=== UPCOMING DIVIDENDS ===
${dividends?.calendar?.filter((d: any) => d.status === 'expected')?.slice(0, 10)?.map((d: any) => `${d.paymentDate}: ${d.ticker} - ${d.amount?.toFixed(2)} ${d.currency}`).join('\n') || 'No upcoming dividends'}

=== WATCHLIST ===
${watchlist?.map((w: any) => `${w.ticker}: ${w.price} ${w.currency}`).join(', ') || 'No watchlist items'}

=== INSTRUCTIONS ===
You are a financial assistant with access to the user's complete portfolio data above.

When answering questions:
- Use specific numbers and data from the portfolio
- Be concise but informative
- Answer in Polish (user's language)
- Provide insights about portfolio performance, diversification, and trends

For charts, respond with JSON in this EXACT format:
{"type": "pie"|"bar"|"area"|"line", "data": [{"label": "...", "value": 123}, ...], "title": "Chart Title", "currency": "PLN"}

IMPORTANT: Use "type" not "chart_type"!

Chart types:
- pie: for allocation/distribution (e.g., asset allocation by ticker)
- bar: for comparisons (e.g., P/L by asset)
- area/line: for time series (not currently supported, use bar instead)
`;

            const fullPrompt = portfolioContext + "\n\nUser: " + content;
            const reply = await engine.current.chat.completions.create({
                messages: [{ role: 'user', content: fullPrompt }],
            });

            const assistantMessage: Message = {
                role: 'assistant',
                content: reply?.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response."
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (e: any) {
            console.error("Chat failed:", e);
            const errorMessage: Message = {
                role: 'assistant',
                content: `Error: ${e?.message || 'Failed to get response'}`
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearMessages = () => {
        setMessages([]);
    };

    const value: AIContextType = {
        messages,
        isLoading,
        initProgress,
        isModelLoaded,
        currentModel,
        sendMessage,
        clearMessages,
        clearChat: clearMessages,
        loadModel,
        changeModel: loadModel,
    };

    return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};

export const useAI = (): AIContextType => {
    const context = useContext(AIContext);
    if (!context) {
        throw new Error('useAI must be used within AIProvider');
    }
    return context;
};
