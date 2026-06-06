import { Chat } from "@/components/Chat/Chat";
import { Footer } from "@/components/Layout/Footer";
import { Navbar } from "@/components/Layout/Navbar";
import { Message } from "@/types";
import Head from "next/head";
import { useEffect, useRef, useState, useMemo } from "react";
import MapPane from '@/components/MapPane';

interface SavedChat {
  id: string;
  title: string;
  messages: Message[];
  mapContext: string;
  district?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [mapContext, setMapContext] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedDistricts, setExpandedDistricts] = useState<Record<string, boolean>>({});

  // Load chats from localStorage on mount
  useEffect(() => {
    const initChats = async () => {
      const saved = localStorage.getItem("mapchats_history");
      
      try {
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) {
            setSavedChats(parsed);
            return;
          }
        }

        // If no history, load from CSV
        const response = await fetch("/project_list.csv");
        if (!response.ok) throw new Error("Failed to load CSV");
        
        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        
        const csvProjects: SavedChat[] = lines.slice(1).map((line, i) => {
          // Split by comma while respecting double quotes for fields containing commas
          const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.replace(/^"|"$/g, '').trim());
          const project = cols[0] || "Unknown Project";
          const promoter = cols[1] || "the developer";
          const type = cols[2] || "Residential";
          const startDate = cols[3] || "N/A";
          const completionDate = cols[4] || "N/A";
          const reraNo = cols[5] || "N/A";
          const totalUnits = cols[7] || "0";
          const soldUnits = cols[8] || "0";
          const status = cols[9] || "In Progress";
          const district = cols[10] || "";
          const village = cols[11] || "";
          const taluk = cols[12] || "";

          const locationQuery = `${village}, ${taluk}, Kerala`;
          const details = `Project: ${project}\nPromoter: ${promoter}\nType: ${type}\nStarted: ${startDate}\nTarget Completion: ${completionDate}\nRERA: ${reraNo}\nUnits: ${totalUnits} Total, ${soldUnits} Sold\nStatus: ${status}\nLocation: ${village}, ${taluk}, ${district}`;

          return {
            id: `csv-${i}`,
            title: project,
            messages: [{ 
              role: "assistant", 
              content: `${project} is a ${type} from ${promoter}. We started building on ${startDate}, and the finish line is set for ${completionDate}. It's fully RERA-certified-${reraNo} 

Out of${totalUnits} total units, ${soldUnits} have already been snapped up by buyers. The project is currently ${status}. 

Located in the prime territory of ${village}, ${taluk}, ${district}. Do you have any questions"` 
            }],
            mapContext: `LOCATION: ${locationQuery}\n${details}`,
            district: district
          };
        });

        setSavedChats(csvProjects);
      } catch (err) {
        console.error("Initialization failed", err);
      }
    };

    initChats();
  }, []);

  // Persist chats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("mapchats_history", JSON.stringify(savedChats));
  }, [savedChats]);

  const groupedChats = useMemo(() => {
    return savedChats.reduce((acc, chat) => {
      const district = chat.district || "My Saved Chats";
      if (!acc[district]) acc[district] = [];
      acc[district].push(chat);
      return acc;
    }, {} as Record<string, SavedChat[]>);
  }, [savedChats]);

  const loadChat = (id: string) => {
    const chat = savedChats.find(c => c.id === id);
    if (chat) {
      setMessages(chat.messages);
      setMapContext(chat.mapContext);
    }
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedChats(savedChats.filter(chat => chat.id !== id));
  };

  const toggleDistrict = (district: string) => {
    setExpandedDistricts(prev => ({
      ...prev,
      [district]: !prev[district]
    }));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async (message: Message) => {
    const updatedMessages = [...messages, message];

    setMessages(updatedMessages);
    setLoading(true);

    // Build payload with map context
    const payload = mapContext.trim()
      ? [
          { role: "system", content: `Map context:\n${mapContext}` } as Message,
          ...updatedMessages
        ]
      : updatedMessages;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: payload
      })
    });

    if (!response.ok) {
      setLoading(false);
      throw new Error(response.statusText);
    }

    const data = response.body;

    if (!data) {
      return;
    }

    setLoading(false);

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let isFirst = true;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);

      if (isFirst) {
        isFirst = false;
        setMessages((messages) => [
          ...messages,
          {
            role: "assistant",
            content: chunkValue
          }
        ]);
      } else {
        setMessages((messages) => {
          const lastMessage = messages[messages.length - 1];
          const updatedMessage = {
            ...lastMessage,
            content: lastMessage.content + chunkValue
          };
          return [...messages.slice(0, -1), updatedMessage];
        });
      }
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `Hi there! I'm MapChats, an AI assistant that can help you chat with Maps`
      }
    ]);
    setMapContext("");
  };

  const handleSaveChat = () => {
    const id = Date.now().toString();
    // Use the first user message or map context for the title
    const firstUserMsg = messages.find(m => m.role === 'user')?.content.slice(0, 30);
    const title = firstUserMsg ? `${firstUserMsg}...` : `Map Chat ${savedChats.length + 1}`;
    
    setSavedChats([...savedChats, { id, title, messages, mapContext, district: "My Saved Chats" }]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: `Hi there! I'm MapChats, an AI assistant that can help you chat with Maps`
      }
    ]);
  }, []);

return (
  <>
    <Head>
      <title>Chat with Properties in Kerala</title>
      <meta name="description" content="Chat with Maps using AI" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" href="/favicon.ico" />
    </Head>

    <Navbar onOpenSidebar={() => setSidebarOpen(true)} />

    <div className="flex sm:h-[calc(100vh-64px)] overflow-hidden">
      {/* Mobile overlay when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: pinned on desktop, slides on mobile */}
      <div
        className={`
          fixed top-0 left-0 h-full w-64 bg-white shadow-lg p-4 z-50
          transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          sm:translate-x-0 sm:static sm:block
          overflow-y-auto
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">Projects in Kerala</h2>
        <button
          className="w-full mb-4 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
          onClick={handleNewChat}
        >
          + New Chat
        </button>
        {savedChats.length === 0 ? (
          <p className="text-sm text-gray-500">No saved chats yet</p>
        ) : (
          <div className="space-y-1">
            {Object.entries(groupedChats)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([district, chats]) => (
                <div key={district} className="mb-1">
                  <button
                    onClick={() => toggleDistrict(district)}
                    className="flex items-center justify-between w-full text-left font-bold p-2 hover:bg-gray-50 rounded transition-colors text-xs uppercase tracking-wider text-slate-600 bg-slate-50/50 border border-slate-100"
                  >
                    <span className="truncate">{district}</span>
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <span className="bg-slate-200 text-slate-600 px-1.5 rounded-md text-[10px]">{chats.length}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-3 w-3 transition-transform duration-200 ${expandedDistricts[district] ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>
                  {expandedDistricts[district] && (
                    <ul className="mt-1 space-y-0.5 ml-2 border-l border-slate-100">
                      {chats.map((chat) => (
                        <li key={chat.id} className="flex items-center group pl-2">
                          <button
                            className="flex-1 text-left hover:bg-slate-100 p-1.5 rounded truncate text-xs text-slate-500 hover:text-slate-900 transition-colors"
                            onClick={() => {
                              loadChat(chat.id);
                              setSidebarOpen(false);
                            }}
                          >
                            {chat.title}
                          </button>
                          <button
                            onClick={(e) => deleteChat(chat.id, e)}
                            className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Main content */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <div className="flex flex-col lg:flex-row flex-1 mx-auto py-4 sm:py-12 gap-6 px-4 sm:px-8 w-full overflow-hidden">
          {/* Map */}
          <div className="flex-[2] h-[40vh] lg:h-full min-h-[300px]">
            <MapPane
              onContextChange={setMapContext}
              initialContext={mapContext}
            />
          </div>

          {/* Chat */}
          <div className="flex-[1] flex flex-col overflow-y-auto min-h-0 pr-2">
            <Chat
              messages={messages}
              loading={loading}
              onSend={handleSend}
              onReset={handleNewChat}
            />
            <button
              className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              onClick={handleSaveChat}
            >
              Save Chat
            </button>
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>
    </div>
  </>
);
}
