import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  followups?: string[];
  sections?: string[];
}

const styles: Record<string, React.CSSProperties> = {
  fab: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #a21caf, #ec4899)',
    border: '2px solid rgba(255, 0, 255, 0.5)',
    boxShadow: '0 0 30px rgba(255, 0, 255, 0.4)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    animation: 'none',
  },
  fabHover: {
    boxShadow: '0 0 50px rgba(255, 0, 255, 0.7)',
    transform: 'scale(1.1)',
  },
  panel: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    width: '380px',
    maxWidth: 'calc(100vw - 48px)',
    height: '520px',
    maxHeight: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(5, 5, 5, 0.96)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '16px',
    boxShadow: '0 0 40px rgba(255, 0, 255, 0.2), 0 0 80px rgba(0, 255, 255, 0.08)',
    overflow: 'hidden',
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    animation: 'fadeIn 0.2s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 0, 255, 0.2)',
    background: 'rgba(168, 28, 175, 0.1)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#e879f9',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  docOutlineBtn: {
    background: 'rgba(255, 0, 255, 0.15)',
    border: '1px solid rgba(255, 0, 255, 0.3)',
    borderRadius: '6px',
    color: '#e879f9',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  welcomeMsg: {
    textAlign: 'center',
    color: 'rgba(168, 28, 175, 0.6)',
    fontSize: '12px',
    padding: '20px 10px',
    lineHeight: '1.6',
  },
  welcomeLinks: {
    marginTop: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
  },
  welcomeChip: {
    background: 'rgba(255, 0, 255, 0.12)',
    border: '1px solid rgba(255, 0, 255, 0.25)',
    borderRadius: '12px',
    padding: '5px 10px',
    fontSize: '11px',
    color: '#e879f9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '12px 12px 4px 12px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#67e8f9',
    maxWidth: '85%',
    wordBreak: 'break-word',
    lineHeight: '1.5',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    background: 'rgba(255, 0, 255, 0.06)',
    border: '1px solid rgba(255, 0, 255, 0.15)',
    borderRadius: '12px 12px 12px 4px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#f0abfc',
    maxWidth: '85%',
    wordBreak: 'break-word',
    lineHeight: '1.5',
  },
  errorBubble: {
    alignSelf: 'flex-start',
    background: 'rgba(255, 0, 0, 0.1)',
    border: '1px solid rgba(255, 0, 0, 0.3)',
    borderRadius: '12px 12px 12px 4px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#fca5a5',
    maxWidth: '85%',
    wordBreak: 'break-word',
    lineHeight: '1.5',
  },
  followupArea: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  followupChip: {
    background: 'rgba(0, 255, 255, 0.08)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '12px',
    padding: '4px 10px',
    fontSize: '11px',
    color: '#5eead4',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    lineHeight: '1.4',
  },
  inputArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    borderTop: '1px solid rgba(255, 0, 255, 0.15)',
    background: 'rgba(0, 0, 0, 0.3)',
  },
  input: {
    flex: 1,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 0, 255, 0.2)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e0e0e0',
    outline: 'none',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    resize: 'none',
    lineHeight: '1.4',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #a21caf, #d946ef)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.2s',
  },
  sendBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  loadingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 0',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#e879f9',
    animation: 'pulse 1s infinite',
  },
  // Sections panel overlay
  sectionsPanel: {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    background: 'rgba(5, 5, 5, 0.98)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    overflowY: 'auto',
  },
  sectionsTitle: {
    color: '#e879f9',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionsBackBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  sectionItem: {
    background: 'rgba(255, 0, 255, 0.06)',
    border: '1px solid rgba(255, 0, 255, 0.15)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#f0abfc',
    fontSize: '13px',
  },
  sectionItemName: {
    fontWeight: 600,
    color: '#e879f9',
    marginBottom: '4px',
  },
  sectionItemDesc: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.5)',
  },
};

const WELCOME_SUGGESTIONS = [
  'What skills are listed?',
  'Summarize the profile',
  'Tell me about employment history',
  'What is the education background?',
];

export const ResumeChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendQuestion = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    setIsLoading(true);

    try {
      const response = await fetch('/api/resume-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      if (data.answer) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: data.answer,
          followups: data.followups || [],
          sections: data.sections || [],
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Update available sections from response
        if (data.sections && data.sections.length > 0) {
          setAvailableSections(data.sections);
        }
      } else {
        throw new Error('Empty response from server');
      }
    } catch (err: any) {
      const errMsg = err.message || 'Connection error. Is the server running?';
      setMessages(prev => [...prev, { role: 'assistant', content: `[Error]: ${errMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    await sendQuestion(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFollowupClick = (followup: string) => {
    sendQuestion(followup);
  };

  const handleDocOutline = () => {
    if (availableSections.length > 0) {
      setShowSections(true);
    } else {
      // If we don't have sections yet, ask the backend
      sendQuestion("What sections are in this document? Give me a table of contents.");
    }
  };

  const handleSectionClick = (sectionName: string) => {
    setShowSections(false);
    sendQuestion(`Tell me about the ${sectionName} section of this CV/resume.`);
  };

  const handleWelcomeSuggestion = (suggestion: string) => {
    sendQuestion(suggestion);
  };

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSections) {
          setShowSections(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, showSections]);

  const openPanel = () => setIsOpen(true);
  const closePanel = () => setIsOpen(false);

  return (
    <>
      {/* Inject keyframes into document head */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .rw-dot:nth-child(2) { animation-delay: 0.2s; }
        .rw-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={openPanel}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={{
            ...styles.fab,
            ...(isHovering ? styles.fabHover : {}),
          }}
          title="Ask about this CV"
          aria-label="Open CV Q&A chat"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div style={styles.panel}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e879f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              CV Q&A Agent
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: '4px' }}>
                -- doc-scoped
              </span>
            </div>
            <div style={styles.headerActions}>
              <button
                onClick={handleDocOutline}
                style={styles.docOutlineBtn}
                title="View document sections"
                aria-label="View document sections"
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.25)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.15)'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Sections
              </button>
              <button
                onClick={closePanel}
                style={styles.closeBtn}
                title="Close"
                aria-label="Close chat"
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'white'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Message Area (relative container for sections overlay) */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Sections Panel Overlay */}
            {showSections && (
              <div style={styles.sectionsPanel}>
                <div style={styles.sectionsTitle}>
                  <span>Document Sections</span>
                  <button onClick={() => setShowSections(false)} style={styles.sectionsBackBtn}>
                    Back
                  </button>
                </div>
                {availableSections.map((section, i) => (
                  <div
                    key={i}
                    style={styles.sectionItem}
                    onClick={() => handleSectionClick(section)}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.15)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.06)'; }}
                  >
                    <div style={styles.sectionItemName}>{section}</div>
                    <div style={styles.sectionItemDesc}>Click to explore this section</div>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.messageArea} className="custom-scrollbar">
              {messages.length === 0 && !isLoading && (
                <div style={styles.welcomeMsg}>
                  <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.5 }}>&#9632;</div>
                  <div>This agent answers questions about the CV/resume document only.</div>
                  <div style={{ marginTop: '8px', opacity: 0.7 }}>Try asking about skills, experience, or education.</div>
                  <div style={styles.welcomeLinks}>
                    {WELCOME_SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        style={styles.welcomeChip}
                        onClick={() => handleWelcomeSuggestion(suggestion)}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.25)'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(255, 0, 255, 0.12)'; }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <React.Fragment key={i}>
                  <div
                    style={
                      msg.role === 'user'
                        ? styles.userBubble
                        : msg.content.startsWith('[Error]')
                        ? styles.errorBubble
                        : styles.assistantBubble
                    }
                  >
                    {msg.content}
                  </div>

                  {/* Follow-up suggestion chips */}
                  {msg.role === 'assistant' && msg.followups && msg.followups.length > 0 && (
                    <div style={styles.followupArea}>
                      {msg.followups.map((followup, j) => (
                        <button
                          key={j}
                          style={styles.followupChip}
                          onClick={() => handleFollowupClick(followup)}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(0, 255, 255, 0.18)'; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(0, 255, 255, 0.08)'; }}
                        >
                          {followup}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}

              {isLoading && (
                <div style={{ ...styles.assistantBubble, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={styles.loadingDots}>
                    <div className="rw-dot" style={styles.dot} />
                    <div className="rw-dot" style={styles.dot} />
                    <div className="rw-dot" style={styles.dot} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Searching document...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the CV..."
              rows={1}
              style={styles.input}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              style={{
                ...styles.sendBtn,
                ...(isLoading || !input.trim() ? styles.sendBtnDisabled : {}),
              }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ResumeChatWidget;
