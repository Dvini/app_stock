import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { usePortfolio } from '../hooks/usePortfolio';

const AIContext = createContext(null);

export const AIProvider = ({ children }) => {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [initProgress, setInitProgress] = useState('');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [currentModel, setCurrentModel] = useState(localStorage.getItem('selected_llm_model') || "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    const engine = useRef(null);

    // We access portfolio data here so the AI *always* has the latest state 
    // without needing to pass it from the UI components.
    const { portfolioSummary, assets, watchlist, transactions } = usePortfolio();

    const loadModel = async (modelId) => {
        try {
            if (engine.current) {
                // If engine exists, we might need to unload or just re-init?
                // WebLLM CreateMLCEngine usually creates a new one. 
                // We should ideally unload the old one to free memory if possible, 
                // but the library manages caching.
                // engine.current.unload(); // If available in API
                setInitProgress('Reloading Engine...');
            } else {
                setInitProgress('Initializing Engine...');
            }

            setIsModelLoaded(false);

            // Configure engine
            const useLocalLMM = import.meta.env.VITE_USE_LOCAL_LMM === 'true';
            let engineConfig = {
                initProgressCallback: (progress) => {
                    setInitProgress(progress.text);
                },
            };

            if (useLocalLMM) {
                // Local LMM Configuration
                console.log("Using Local LMM Configuration for:", modelId);
                engineConfig.appConfig = {
                    model_list: [
                        {
                            "model": "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
                            "model_id": modelId,
                            "model_url": `/models/${modelId}`,
                            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                            "vram_required_MB": 1500,
                            "low_resource_required": true,
                        }
                    ]
                };
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
            const currency = portfolioSummary?.baseCurrency || 'PLN';

            const watchlistStr = watchlist?.length
                ? watchlist.map(w => `- ${w.ticker} (${w.price} ${w.currency})`).join('\n      ')
                : 'Brak';

            const transactionsStr = transactions?.length
                ? transactions.map(t => `${t.date}: ${t.type} ${t.ticker} x${t.amount} @ ${t.price} ${t.currency}`).join('\n      ')
                : 'Brak';

            let assetsListText = assets?.length
                ? assets.map(a => {
                    const val = a.valueBase ? a.valueBase.toFixed(2) : '0.00';
                    return `- ASSET: ${a.ticker} | QTY: ${a.amount} | VAL_PLN: **${val}**`;
                }).join('\n      ')
                : 'Brak akcji/ETF.';

            // Append Cash
            const cashVal = portfolioSummary?.cash ? parseFloat(portfolioSummary.cash.replace(/\s/g, '').replace(',', '.')) : 0;
            if (cashVal > 0.01) {
                assetsListText += `\n      - ASSET: GOTÓWKA | QTY: 1 | VAL_PLN: **${cashVal.toFixed(2)}**`;
            }

            const systemPrompt = `Jesteś profesjonalnym, ale przystępnym doradcą inwestycyjnym w aplikacji StockTracker.
      Twoim językiem operacyjnym jest POLSKI. Odpowiadaj zawsze po polsku.
      
      Twoim jedynym źródłem prawdy są poniższe dane. NIE wymyślaj aktywów, których tu nie ma.
      
      ===================================================
      KONTEKST FINANSOWY
      ===================================================
      💰 Waluta Bazowa: ${currency}
      📈 Wartość Całkowita: ${portfolioSummary?.totalValue || '0'} ${currency}
      
      ===================================================
      SEKCJA 1: POSIADANE AKTYWA (PORTFEL)
      ===================================================
      ${assetsListText}
      
      ===================================================
      SEKCJA 2: OBSERWOWANE (WATCHLIST)
      ===================================================
      ${watchlistStr}
      
      ===================================================
      SEKCJA 3: OSTATNIE TRANSAKCJE
      ===================================================
      ${transactionsStr}
      ===================================================
      
      TWOJE ZASADY:
      1. Bądź konkretny. Nie lej wody.
      2. Korzystaj WYŁĄCZNIE z danych z SEKCJI 1 (POSIADANE) dla analizy portfela.

      SPECJALNA UMIEJĘTNOŚĆ - RYSOWANIE WYKRESÓW:
      Jeśli użytkownik poprosi o wykres, wygeneruj JSON:

      |||CHART_START|||
      {
        "type": "pie", 
        "title": "Tytuł Wykresu",
        "data": [
          { "label": "PRZYKLAD_A", "value": 100 }, 
          { "label": "PRZYKLAD_B", "value": 200 }
        ],
        "currency": "PLN"
      }
      |||CHART_END|||

      WAZNE ZASADY DLA WYKRESOW:
      1.  PROSZĘ SKOPIOWAĆ DANE TYLKO Z "SEKCJA 1". NIE UŻYWAJ DANYCH Z PRZYKŁADU (PRZYKLAD_A).
      2.  Format linii w SEKCJI 1 to: "ASSET: [Nazwa] | ... | VAL_PLN: **[Wartość]**".
      3.  Dla wykresu 'pie' (dywersyfikacja):
          - Przejdź przez KAŻDY element w SEKCJI 1 (włącznie z GOTÓWKA).
          - label = [Nazwa]
          - value = [Wartość] (liczba z pola VAL_PLN).
      4.  ZNACZNIKI: |||CHART_START||| i |||CHART_END|||.
      
      Pytanie użytkownika: `;

            // 0. Truncate History to save context window (Keep last 20 messages)
            const MAX_HISTORY = 20;
            const recentMessages = newMessages.length > MAX_HISTORY
                ? newMessages.slice(newMessages.length - MAX_HISTORY)
                : newMessages;

            // Debugging: Log what the AI sees
            console.log("AI System Prompt Assets:", assetsListText);

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

    return (
        <AIContext.Provider value={{ messages, sendMessage, isLoading, initProgress, isModelLoaded, clearChat, currentModel, changeModel }}>
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
