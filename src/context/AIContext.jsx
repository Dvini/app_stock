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

            const assetsStr = assets?.length
                ? assets.map(a => `- **${a.ticker}**: ${a.amount} szt., Śr.Cena: ${a.avgPrice.toFixed(2)}, Obecnie: ${a.price} ${a.currency} (Zysk/Strata: ${a.pl})`).join('\n      ')
                : 'Brak aktywów';

            const systemPrompt = `Jesteś profesjonalnym, ale przystępnym doradcą inwestycyjnym w aplikacji StockTracker.
      Twoim językiem operacyjnym jest POLSKI. Odpowiadaj zawsze po polsku.
      
      Twoim jedynym źródłem prawdy są poniższe dane. NIE wymyślaj aktywów, których tu nie ma.
      
      ===================================================
      KONTEKST FINANSOWY
      ===================================================
      💰 Waluta Bazowa: ${currency}
      📈 Wartość Całkowita: ${portfolioSummary?.totalValue || '0'} ${currency}
      💵 Dostępna Gotówka: ${portfolioSummary?.cash || '0'} ${currency}
      
      ===================================================
      SEKCJA 1: POSIADANE AKTYWA (PORTFEL)
      (To są akcje, które użytkownik FAKTYCZNIE POSIADA)
      ===================================================
      ${assetsStr}
      
      ===================================================
      SEKCJA 2: OBSERWOWANE (WATCHLIST)
      (To są akcje, które użytkownik TYLKO OBSERWUJE - NIE POSIADA ICH)
      ===================================================
      ${watchlistStr}
      
      ===================================================
      SEKCJA 3: OSTATNIE TRANSAKCJE
      ===================================================
      ${transactionsStr}
      ===================================================
      
      TWOJE ZASADY:
      1. Bądź konkretny. Nie lej wody. Używaj Markdown do formatowania.
      2. ODRÓŻNIAJ "Posiadane" od "Obserwowanych". Jeśli akcja jest w sekcji OBSERWOWANE, to znaczy, że użytkownik jej nie ma.
      3. Jeśli portfel jest pusty, zachęć do dodania pierwszej transakcji.
      4. Analizuj ryzyko i dywersyfikację na podstawie sekcji POSIADANE.
      5. Jeśli użytkownik pyta o spółkę spoza listy, użyj swojej wiedzy ogólnej.
      
      Pytanie użytkownika:`;

            const chunks = await engine.current.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, ...newMessages],
                temperature: 0.7,
                stream: false, // For simplicity in this demo
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
