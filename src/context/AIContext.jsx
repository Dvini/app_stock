import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { usePortfolio } from '../hooks/usePortfolio';

const AIContext = createContext(null);

export const AIProvider = ({ children }) => {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [initProgress, setInitProgress] = useState('');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [currentModel, setCurrentModel] = useState(localStorage.getItem('selected_llm_model') || "Qwen3-1.7B-q4f16_1-MLC");
    const engine = useRef(null);

    // We access portfolio data here so the AI *always* has the latest state 
    // without needing to pass it from the UI components.
    const { portfolioSummary, assets, watchlist, transactions } = usePortfolio();

    // [NEW] Use Ref to hold latest data for AI access without stale closures
    const portfolioDataRef = useRef({ portfolioSummary, assets, watchlist, transactions });

    // Keep Ref updated
    useEffect(() => {
        portfolioDataRef.current = { portfolioSummary, assets, watchlist, transactions };
    }, [portfolioSummary, assets, watchlist, transactions]);

    const loadModel = async (modelId) => {
        try {
            if (engine.current) {
                // If engine exists, we might need to unload or just re-init?
                // WebLLM CreateMLCEngine usually creates a new one. 
                // We should ideally unload the old one to free memory if possible, 
                // but the library manages caching.
                await engine.current.unload(); // [NEW] Explicitly unload old model
                setInitProgress('Reloading Engine...');
            } else {
                setInitProgress('Initializing Engine...');
            }

            setIsModelLoaded(false);

            // Configure engine
            const useLocalLMM = import.meta.env.VITE_USE_LOCAL_LMM === 'true';
            const disableAI = import.meta.env.VITE_DISABLE_AI === 'true';

            if (disableAI) {
                setInitProgress('');
                setIsModelLoaded(false);
                return;
            }

            let engineConfig = {
                initProgressCallback: (progress) => {
                    setInitProgress(progress.text);
                },
            };

            // Custom Model Definitions
            // Source of Truth: https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts
            const customModels = [
                // === STANDARD MODELS ===
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

                // === NEW VERIFIED QWEN 3 MODELS (Native Support from config.ts) ===
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

                // === EXPERIMENTAL GEMMA 3 (Mapping to Gemma 2 Lib - Use with Caution) ===
                {
                    "model": "https://huggingface.co/mlc-ai/gemma-3-1b-it-q4f32_1-MLC",
                    "model_id": "gemma-3-1b-it-q4f32_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 1500,
                    "low_resource_required": true,
                },
                {
                    "model": "https://huggingface.co/mlc-ai/gemma-3-4b-it-q4f16_1-MLC",
                    "model_id": "gemma-3-4b-it-q4f16_1-MLC",
                    "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    "vram_required_MB": 3500,
                    "low_resource_required": true,
                }
            ];

            // NOTE: If using Local LMM, you'd override this. 
            // For now, we merge these into general appConfig to ensure IDs are found.
            if (!engineConfig.appConfig) engineConfig.appConfig = { model_list: [] };

            // We append our custom models to the config so WebLLM knows about them.
            // We also need to include standard models if we want them to keep working, 
            // but WebLLM usually falls back to default if model_list is not exhaustive OR if we just add to it.
            // Actually, CreateMLCEngine takes `modelId` and checks if it's in `appConfig.model_list`.
            // If `appConfig` is provided, it MIGHT override defaults. simpler to just provide the one we are loading.

            engineConfig.appConfig.model_list = [...customModels];

            if (useLocalLMM) {
                // ... existing local logic if needed ...
                // Keeping simplicity: If local is requested, we might overwrite, but let's stick to the user's manual selection for now.
            }

            // Create engine instance
            engine.current = await CreateMLCEngine(modelId, engineConfig);
            setIsModelLoaded(true);
            setInitProgress('');
        } catch (error) {
            console.error("Failed to load WebLLM:", error);
            setInitProgress('Error loading model. Check console.');
        }
    };

    useEffect(() => {
        loadModel(currentModel);

        // [NEW] Cleanup on unmount
        return () => {
            if (engine.current) {
                engine.current.unload();
            }
        };
    }, []); // On mount

    const changeModel = async (newModelId) => {
        if (newModelId === currentModel && isModelLoaded) return;
        localStorage.setItem('selected_llm_model', newModelId);
        setCurrentModel(newModelId);
        await loadModel(newModelId);
    };

    const sendMessage = async (userText) => {
        if (!engine.current || !isModelLoaded) return;

        setIsLoading(true);
        const newMessages = [...messages, { role: 'user', content: userText }];
        setMessages(newMessages);

        try {
            // Prepare system prompt with REAL-TIME context in POLISH
            // [FIX] Use Data From Ref to avoid Stale Closures
            const { portfolioSummary, assets, watchlist, transactions } = portfolioDataRef.current;
            const currency = portfolioSummary?.baseCurrency || 'PLN';

            // Construct Rich Context JSON
            const contextData = {
                meta: {
                    userCurrency: currency,
                    timestamp: new Date().toISOString()
                },
                portfolio: {
                    totalValue: portfolioSummary?.totalValue || '0',
                    totalPL: portfolioSummary?.totalPL || '0',
                    totalPLPercent: portfolioSummary?.totalPLPercent || '0%',
                    cash: portfolioSummary?.cash || '0'
                },
                assets: assets?.map(a => ({
                    ticker: a.ticker,
                    amount: a.amount,
                    avgPrice: a.avgPrice.toFixed(2),
                    currentPrice: a.price, // comes from formatted string or number? Check usePortfolio. using .price from processedAssets is string usually.
                    value: a.valueBase,
                    pl: a.pl,
                    currency: a.currency
                })) || [],
                watchlist: watchlist?.map(w => ({
                    ticker: w.ticker,
                    price: w.price,
                    currency: w.currency
                })) || [],
                lastTransactions: transactions?.slice(0, 5).map(t => ({
                    date: t.date,
                    type: t.type,
                    ticker: t.ticker,
                    amount: t.amount,
                    price: t.price,
                    total: t.total
                })) || []
            };

            const systemPrompt = `
Jesteś "StockBot" - zaawansowanym, inteligentnym asystentem finansowym w aplikacji StockTracker.
Twoim celem jest pomoc użytkownikowi w analizie portfela i edukacja finansowa.

Twoja Osobowość:
- Profesjonalny, analityczny, ale pomocny.
- Używasz języka polskiego.
- Jesteś "Read-Only" (Tylko do odczytu).

===================================================
TWOJE UPRAWNIENIA I LIMITY
===================================================
1. [READ-ONLY]: Masz dostęp do bazy danych TYLKO DO ODCZYTU.
2. [NO TRADING]: NIE możesz wykonywać transakcji (kupno/sprzedaż). Jeśli użytkownik o to prosi, napisz: "Nie mogę wykonywać operacji. Użyj przycisku 'Nowa Operacja' w menu."
3. [DATA TRUTH]: Poniższy JSON "CONTEXT_DATA" to jedyne źródło prawdy o stanie posiadania użytkownika. Nie zmyślaj transakcji.

===================================================
KONTEKST DANYCH (CONTEXT_DATA)
===================================================
${JSON.stringify(contextData, null, 2)}
===================================================

TWOJE ZADANIA:
1. Analiza Portfela: Oceniaj dywersyfikację i wyniki na podstawie sekcji 'assets'.
2. Wyjaśnianie: Tłumacz terminy giełdowe (P/E, Dywidenda) prostym językiem.
3. Obliczenia: Jeśli użytkownik pyta "ile mam w USD", a masz dane w PLN, spróbuj oszacować lub podaj wartość z pola 'portfolio'.

FORMATOWANIE ODPOWIEDZI:
- Używaj **pogrubień** dla kwot i nazw tickerów (np. **AAPL**).
- Listuj aktywa w punktach.
- Bądź zwięzły.

SPECJALNE KOMENDY (WYKRESY):
Jeśli użytkownik prosi o wizualizację/wykres (np. "narysuj wykres", "pokaż dywersyfikację"), WYGENERUJ JSON w formacie:

|||CHART_START|||
{
  "type": "pie",
  "title": "Tytuł Wykresu",
  "data": [
    { "label": "PRZYKLAD_A", "value": 100 },
    { "label": "PRZYKLAD_B", "value": 200 }
  ],
  "currency": "${currency}"
}
|||CHART_END|||

WAŻNE ZASADY GENEROWANIA WYKRESÓW:
1. Użyj danych z sekcji 'assets' w CONTEXT_DATA.
2. Nie zmyślaj danych. Skopiuj je dokładnie.
3. Dla wykresu portfela ('pie'):
   - Przejdź przez każdy element tablicy 'assets'.
   - "label" to pole 'ticker'.
   - "value" to pole 'value' (jako liczba, bez waluty).
   - Jeśli jest "cash" > 0 w 'portfolio', dodaj to jako osobny element: { "label": "GOTÓWKA", "value": ... }.
4. ZAWSZE otaczaj JSON znacznikami |||CHART_START||| oraz |||CHART_END|||.

Pytanie użytkownika: `;

            // 0. Truncate History to save context window (Keep last 20 messages)
            const MAX_HISTORY = 20;
            const recentMessages = newMessages.length > MAX_HISTORY
                ? newMessages.slice(newMessages.length - MAX_HISTORY)
                : newMessages;

            // Debugging: Log what the AI sees
            console.log("AI System Prompt JSON:", JSON.stringify(contextData, null, 2));

            const chunks = await engine.current.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, ...recentMessages],
                temperature: 0.7,
                stream: false,
            });

            const reply = chunks.choices[0].message.content;
            setMessages([...newMessages, { role: 'assistant', content: reply }]);

        } catch (error) {
            console.error("AI Error:", error);
            setMessages([...newMessages, { role: 'assistant', content: "Przepraszam, wystąpił błąd podczas generowania odpowiedzi." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    const value = React.useMemo(() => ({
        messages,
        sendMessage,
        isLoading,
        initProgress,
        isModelLoaded,
        clearChat,
        currentModel,
        changeModel
    }), [messages, isLoading, initProgress, isModelLoaded, currentModel]);

    return (
        <AIContext.Provider value={value}>
            {children}
        </AIContext.Provider>
    );
};

export const useAI = () => {
    const context = useContext(AIContext);
    if (!context) {
        throw new Error("useAI must be used within an AIProvider");
    }
    return context;
};
