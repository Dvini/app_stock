import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
// @ts-expect-error - will be migrated to TypeScript
import { useAI } from '../context/AIContext';
import { cn } from '../lib/utils';
import { PieChart } from '../components/PieChart';
// @ts-expect-error - will be migrated to TypeScript
import { WebGPUChart } from '../components/WebGPUChart';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const AI = () => {
    const { messages, sendMessage, isLoading, initProgress, isModelLoaded, clearChat, currentModel } = useAI();
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = () => {
        if (!input.trim() || isLoading || !isModelLoaded) return;
        sendMessage(input);
        setInput('');
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col flex-1 animate-in fade-in zoom-in duration-500">
            <header className="mb-6 flex justify-between items-start flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Finansowy Asystent AI</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        {initProgress ? (
                            <span className="flex items-center gap-2 text-blue-400">
                                <Loader2 size={14} className="animate-spin" />
                                {initProgress}
                            </span>
                        ) : isModelLoaded ? (
                            <span className="text-emerald-400 flex items-center gap-2">
                                ● Model gotowy ({currentModel})
                            </span>
                        ) : (
                            'Inicjalizacja...'
                        )}
                    </p>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={clearChat}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors border border-rose-950/50"
                        title="Wyczyść historię czatu"
                    >
                        <Trash2 size={14} />
                        Nowy Czat
                    </button>
                )}
            </header>

            <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                    {messages.length === 0 && (
                        <div className="text-center text-slate-500 mt-20">
                            <Bot size={48} className="mx-auto mb-4 opacity-20" />
                            <p>Zadaj pytanie dotyczące Twojego portfela.</p>
                            <p className="text-xs mt-2 opacity-60">
                                Przykłady: "Jaka jest wartość mojego portfela?", "Co sądzisz o mojej dywersyfikacji?"
                            </p>
                        </div>
                    )}

                    {messages.map((msg: Message, idx: number) => (
                        <div key={idx} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}>
                            <div
                                className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                                    msg.role === 'user' ? 'bg-blue-600' : 'bg-emerald-600'
                                )}
                            >
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                            <div
                                className={cn(
                                    'max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed',
                                    msg.role === 'user'
                                        ? 'bg-blue-600/20 text-blue-100 rounded-tr-sm'
                                        : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                                )}
                            >
                                <MessageContent content={msg.content} />
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 animate-pulse">
                                <Bot size={16} />
                            </div>
                            <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-75"></span>
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-150"></span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-950 border-t border-slate-800">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            disabled={!isModelLoaded || isLoading}
                            placeholder={isModelLoaded ? 'Napisz wiadomość...' : 'Ładowanie modelu...'}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!isModelLoaded || isLoading || !input.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:shadow-none"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                    <p className="text-[10px] text-center mt-2 text-slate-600">
                        Model działa lokalnie w Twojej przeglądarce. Historia czatu nie jest zapisywana po odświeżeniu.
                    </p>
                </div>
            </div>
        </div>
    );
};

interface MessageContentProps {
    content: string;
}

const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
    // Step 1: Remove <think> tags from content
    let processedContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Step 2: Split content into lines and detect standalone JSON chart objects
    const lines = processedContent.split('\n');
    const parts: Array<{ type: 'text' | 'chart'; content: string }> = [];
    let currentTextBlock = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Try to detect standalone JSON chart object on this line
        if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
            try {
                const jsonObj = JSON.parse(trimmedLine);
                if (jsonObj.type && ['pie', 'bar', 'line', 'area'].includes(jsonObj.type) && jsonObj.data) {
                    // This is a chart JSON - save any accumulated text first
                    if (currentTextBlock.trim()) {
                        parts.push({ type: 'text', content: currentTextBlock });
                        currentTextBlock = '';
                    }
                    // Add the chart
                    parts.push({ type: 'chart', content: trimmedLine });
                    continue;
                }
            } catch {
                // Not valid JSON, treat as text
            }
        }

        // Accumulate as text
        currentTextBlock += line + '\n';
    }

    // Add any remaining text
    if (currentTextBlock.trim()) {
        parts.push({ type: 'text', content: currentTextBlock });
    }

    // Step 3: If no charts found via line detection, check for markdown code blocks
    if (parts.every(p => p.type === 'text')) {
        const fullText = parts.map(p => p.content).join('');
        const hasChartType =
            fullText.includes('"type": "pie"') ||
            fullText.includes('"type": "area"') ||
            fullText.includes('"type": "bar"') ||
            fullText.includes('"type": "line"');

        if ((fullText.includes('```json') || fullText.includes('```')) && hasChartType) {
            const markdownRegex = /```(?:json)?([\s\S]*?)```/g;
            const newParts: Array<{ type: 'text' | 'chart'; content: string }> = [];
            let lastIndex = 0;
            let match;

            while ((match = markdownRegex.exec(fullText)) !== null) {
                if (match.index > lastIndex) {
                    const textPart = fullText.substring(lastIndex, match.index);
                    if (textPart.trim()) {
                        newParts.push({ type: 'text', content: textPart });
                    }
                }
                newParts.push({ type: 'chart', content: match[1]?.trim() || match[0] });
                lastIndex = markdownRegex.lastIndex;
            }
            if (lastIndex < fullText.length) {
                const textPart = fullText.substring(lastIndex);
                if (textPart.trim()) {
                    newParts.push({ type: 'text', content: textPart });
                }
            }

            if (newParts.length > 0) {
                parts.length = 0; // Clear array
                parts.push(...newParts); // Add new parts
            }
        }
    }

    // Step 4: Render parts
    return (
        <div className="space-y-4">
            {parts.map((part, index) => {
                if (part.type === 'chart') {
                    try {
                        let jsonStr = part.content.replace(/\/\/.*$/gm, '').trim();
                        const chartData = JSON.parse(jsonStr);

                        if (chartData.type === 'pie') {
                            return (
                                <div key={index} className="bg-slate-900 rounded-xl p-4 border border-slate-700 my-2">
                                    {chartData.title && (
                                        <div className="text-xs font-bold text-center text-slate-400 mb-2">
                                            {chartData.title}
                                        </div>
                                    )}
                                    <div className="h-64 w-full">
                                        <PieChart data={chartData.data} />
                                    </div>
                                </div>
                            );
                        }

                        if (chartData.type === 'area' || chartData.type === 'line') {
                            return (
                                <div key={index} className="bg-slate-900 rounded-xl p-4 border border-slate-700 my-2">
                                    {chartData.title && (
                                        <div className="text-xs font-bold text-center text-slate-400 mb-2">
                                            {chartData.title}
                                        </div>
                                    )}
                                    <div className="h-64 w-full">
                                        <WebGPUChart data={chartData.data} currency={chartData.currency || 'PLN'} />
                                    </div>
                                </div>
                            );
                        }

                        if (chartData.type === 'bar') {
                            return (
                                <div key={index} className="bg-slate-900 rounded-xl p-4 border border-slate-700 my-2">
                                    {chartData.title && (
                                        <div className="text-xs font-bold text-center text-slate-400 mb-2">
                                            {chartData.title}
                                        </div>
                                    )}
                                    <div className="h-64 w-full">
                                        <PieChart data={chartData.data} />
                                    </div>
                                </div>
                            );
                        }
                    } catch (e) {
                        console.error('Chart Render Error', e);
                        return (
                            <div
                                key={index}
                                className="text-red-400 text-xs p-2 border border-red-900 bg-red-900/10 rounded"
                            >
                                Błąd renderowania wykresu
                            </div>
                        );
                    }
                }

                if (!part.content.trim()) return null;
                return (
                    <div key={index} className="whitespace-pre-wrap">
                        {part.content}
                    </div>
                );
            })}
        </div>
    );
};
