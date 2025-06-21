import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, SquareIcon, MicIcon, Loader2Icon, SparklesIcon, MessageSquareTextIcon, CircleCheckIcon, XCircleIcon, XIcon, AlertTriangleIcon } from 'lucide-react';



const GITHUB_PAT = import.meta.env.VITE_GITHUB_PAT;
class OpenAIClient {
  constructor(options) {
    this.baseURL = options.baseURL;
    this.apiKey = options.apiKey; // This will be our GITHUB_PAT from env var
  }

  chat = {
    completions: {
      create: async (params) => {
        try {
          const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}` // Using Bearer token for PAT
            },
            body: JSON.stringify(params)
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
          }

          const data = await response.json();
          return data; // This will contain the 'choices' array
        } catch (error) {
          console.error("Fetch error:", error);
          throw error; // Re-throw to be caught by calling function
        }
      }
    }
  };
}

function App() {
  // Access GITHUB_PAT from environment variables provided by Vite
  const GITHUB_PAT = import.meta.env.VITE_GITHUB_PAT;

  // Initialize the client after ensuring GITHUB_PAT is available
  const clientRef = useRef(null);
  const [isClientReady, setIsClientReady] = useState(false); // New state to track client readiness

  useEffect(() => {
    // Initialize clientRef.current only once when GITHUB_PAT is available and client not yet created
    if (GITHUB_PAT && !clientRef.current) {
      clientRef.current = new OpenAIClient({
        baseURL: "https://models.github.ai/inference",
        apiKey: GITHUB_PAT
      });
      setIsClientReady(true); // Set client as ready
      setError(''); // Clear any previous error about PAT not set
    } else if (!GITHUB_PAT) {
      // If GITHUB_PAT is not set, display an error and mark client as not ready
      setError("GITHUB_PAT environment variable is not set. Please check your .env file or Vercel settings.");
      console.error("VITE_GITHUB_PAT environment variable is not set.");
      setIsClientReady(false);
    }
  }, [GITHUB_PAT]); // Depend on GITHUB_PAT to re-run if it changes


  const [selectedRole, setSelectedRole] = useState('SDE');
  const [selectedRound, setSelectedRound] = useState('Technical');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewRoundCount, setInterviewRoundCount] = useState(0); // Tracks current question number

  // Speech API States
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isListeningUser, setIsListeningUser] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState(''); // What user is currently speaking

  // Refs for Speech Recognition and Speech Synthesis
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);


  // Initialize Speech Recognition on component mount
  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // Listen for a single utterance
      recognitionRef.current.interimResults = true; // Get interim results while speaking
      recognitionRef.current.lang = 'en-US'; // Set language

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        setLiveTranscript(interimTranscript); 
        if (finalTranscript) {
          setUserAnswer(prev => (prev ? prev + ' ' : '') + finalTranscript.trim()); 
          setLiveTranscript(''); 
        }
      };

      recognitionRef.current.onend = () => {
        setIsListeningUser(false);
        setLiveTranscript(''); 
        console.log("Speech recognition ended.");
      };

      recognitionRef.current.onerror = (event) => {
        setIsListeningUser(false);
        setLiveTranscript('');
        setError(`Speech recognition error: ${event.error}`);
        console.error("Speech recognition error:", event.error);
      };
    } else {
      setError("Speech Recognition API is not supported in this browser.");
      console.warn("Web Speech Recognition API not supported.");
    }

    // Clean up synthesis on unmount
    return () => {
      if (synthRef.current.speaking) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Helper function for displaying messages (question, feedback, error) with dynamic styling
  const displayMessage = (message, type) => {
    if (type === 'error') {
      setError(message);
      setFeedback('');
    } else if (type === 'feedback') {
      setFeedback(message);
      setError('');
    } else { // type === 'question'
      setCurrentQuestion(message);
      setError('');
      setFeedback('');
    }
  };

  const speakText = async (text, callback = () => {}) => {
    // Always use browser's SpeechSynthesis
    const synth = window.speechSynthesis;
    if (!synth) {
      setError("Text-to-Speech (TTS) is not supported in this browser.");
      callback();
      return;
    }
    
    // Cancel any ongoing speech before starting new one
    if (synth.speaking) {
        synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = () => setIsSpeakingAI(true);
    utterance.onend = () => { setIsSpeakingAI(false); callback(); };
    utterance.onerror = (event) => { setIsSpeakingAI(false); setError(`TTS error: ${event.error}`); console.error("SpeechSynthesis error:", event.error); callback(); };
    synth.speak(utterance);
  };


  const startListening = () => {
    if (recognitionRef.current) {
      // Clear previous transcript and answer before starting new listening session
      setLiveTranscript('');
      setError(''); // Clear any previous errors
      setUserAnswer(''); // Clear user answer field for new speech input
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Stop AI speech if it's playing

      setIsListeningUser(true);
      recognitionRef.current.start();
      console.log("Speech recognition started...");
    } else {
      setError("Speech Recognition is not available. Please ensure your browser supports it and you are on HTTPS.");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListeningUser) {
      recognitionRef.current.stop();
      setIsListeningUser(false);
      console.log("Speech recognition stopped.");
    }
  };

  const generateAndSpeakQuestion = async () => {
    if (!isClientReady || !clientRef.current) { // Ensure client is ready
      setError("API client not initialized. Please ensure GITHUB_PAT is set correctly.");
      setIsLoadingQuestion(false);
      return;
    }

    setFeedback(''); // Clear feedback when generating new question
    setUserAnswer(''); // Clear user answer input for new question
    setLiveTranscript(''); // Clear live transcript
    setError(''); // Clear any previous errors
    setCurrentQuestion('Generating your question...');
    setIsLoadingQuestion(true);
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Stop any ongoing speech
    stopListening(); // Stop listening if active

    try {
      const promptMessage = `As an experienced interviewer for a ${selectedRole} role, please generate a concise and professional ${selectedRound} interview question.
Ensure the question is:
- Directly relevant to the ${selectedRole} role.
- Appropriate for a ${selectedRound} round (e.g., if technical, ask a coding/design/conceptual question; if behavioral, ask about experience/skills).
- Clear, unambiguous, and encouraging of a detailed answer.
- Just provide the question text itself, without any introductory phrases like "Question:" or "Here's your question:".

Example for SDE Technical: "Explain the concept of multithreading and its challenges in Python."
Example for HR Behavioral: "Describe a time you had to deal with a difficult colleague. How did you handle the situation?"
`;

      const response = await clientRef.current.chat.completions.create({
        messages: [
          { role: "system", content: "You are a professional AI interviewer tasked with generating interview questions." },
          { role: "user", content: promptMessage }
        ],
        model: "openai/gpt-4o",
        temperature: 0.7,
        max_tokens: 150
      });

      if (response && response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
        const questionText = response.choices[0].message.content.trim();
        displayMessage(questionText, 'question');
        speakText(questionText);
        setInterviewRoundCount(prev => prev + 1); // Increment question count
      } else {
        displayMessage('Error: Could not generate a question. Invalid response from API.', 'error');
      }
    } catch (err) {
      console.error("The sample encountered an error:", err);
      displayMessage(`Error: ${err.message || 'An unknown error occurred while calling the model.'}`, 'error');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleStartInterview = async () => {
    setInterviewStarted(true);
    setInterviewRoundCount(0); // Reset round count
    generateAndSpeakQuestion();
  };

  const handleSubmitAnswer = async () => {
    stopListening(); // Stop listening if still active
    if (!userAnswer.trim()) {
      displayMessage("Please provide an answer before submitting.", 'error');
      return;
    }

    setFeedback('');
    setError('');
    setIsLoadingFeedback(true);
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Stop any ongoing speech

    try {
      const feedbackPrompt = `As an experienced interviewer for a ${selectedRole} role, you have asked the following ${selectedRound} question:

Question: "${currentQuestion}"

The candidate provided the following answer:
Answer: "${userAnswer.trim()}"

Please provide constructive feedback on this answer. Your feedback should:
- Identify strengths in the answer.
- Point out areas for improvement.
- Offer suggestions for how the candidate could improve their response.
- Be professional, encouraging, and actionable.
- Limit the feedback to a concise paragraph or two.
After providing feedback, ask a new, follow-up question for the same role and round.
`;

      const response = await clientRef.current.chat.completions.create({
        messages: [
          { role: "system", content: "You are a professional AI interviewer tasked with providing constructive feedback to candidates and asking follow-up questions." },
          { role: "user", content: feedbackPrompt }
        ],
        model: "openai/gpt-4o",
        temperature: 0.7,
        max_tokens: 500 // Increased max_tokens to accommodate both feedback and a new question
      });

      if (response && response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
        const fullResponse = response.choices[0].message.content.trim();
        // Assuming the model provides feedback first, then the next question.
        // We'll try to split it. This might need refinement based on actual LLM output patterns.
        const feedbackAndNextQuestion = fullResponse.split(/\n\n(?:Next Question|Follow-up Question):/i);

        let extractedFeedback = fullResponse;
        let extractedNextQuestion = '';

        if (feedbackAndNextQuestion.length > 1) {
            extractedFeedback = feedbackAndNextQuestion[0].trim();
            extractedNextQuestion = feedbackAndNextQuestion[1].trim();
        } else {
            // If the model doesn't split clearly, try to find the last sentence as question or assume all is feedback
            // For robustness, if we can't reliably split, just display the full response as feedback.
            // A more robust solution would involve guiding the LLM to output structured JSON for feedback and question.
            console.warn("Could not clearly separate feedback and next question from LLM response. Displaying full response as feedback.");
        }
        
        displayMessage(extractedFeedback, 'feedback');
        speakText(extractedFeedback, () => {
            if (extractedNextQuestion) {
                // If a next question was clearly identified, set it and speak it
                setCurrentQuestion(extractedNextQuestion);
                speakText(extractedNextQuestion);
                setInterviewRoundCount(prev => prev + 1);
            } else {
                // If no clear next question, generate a new one from scratch after feedback
                generateAndSpeakQuestion();
            }
        });

      } else {
        displayMessage('Error: Could not generate feedback or next question. Invalid response from API.', 'error');
      }
    } catch (err) {
      console.error("Feedback generation error:", err);
      displayMessage(`Error generating feedback: ${err.message || 'An unknown error occurred.'}`, 'error');
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleEndInterview = () => {
    setInterviewStarted(false);
    setInterviewRoundCount(0);
    setFeedback('');
    setError('');
    setUserAnswer('');
    setLiveTranscript('');
    setCurrentQuestion('Interview ended. Click "Start Interview" to begin a new session.');
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Stop any ongoing speech
    stopListening();
  };

  // Initial message when the component mounts
  useEffect(() => {
    setCurrentQuestion('Click "Start Interview" to get your first question!');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center p-4 antialiased">
      <div className="container bg-white rounded-3xl shadow-xl p-8 md:p-10 flex flex-col gap-8 w-full max-w-3xl border border-gray-200 backdrop-blur-sm bg-opacity-95">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 mb-4 animate-fadeIn">
            🤖 AI Interview Co-Pilot
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed font-light animate-fadeIn animation-delay-300">
            Your personal AI interviewer for practice and preparation.
          </p>
        </div>

        {/* API Client Status Indicator */}
        {!isClientReady && GITHUB_PAT && (
          <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 rounded-xl flex items-center gap-3 shadow-md mb-6">
            <AlertTriangleIcon className="flex-shrink-0 w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">Warning: API Not Fully Initialized</h3>
              <p className="text-sm">
                The API client is not fully ready. Please ensure your `GITHUB_PAT` is valid and the environment is set up correctly.
              </p>
            </div>
          </div>
        )}
        {!GITHUB_PAT && (
           <div className="bg-red-100 border border-red-300 text-red-800 p-4 rounded-xl flex items-center gap-3 shadow-md mb-6">
            <XCircleIcon className="flex-shrink-0 w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">Error: GITHUB_PAT Not Found!</h3>
              <p className="text-sm">
                Please set the `VITE_GITHUB_PAT` environment variable in your project's `.env` file (e.g., `VITE_GITHUB_PAT=YOUR_KEY_HERE`) and restart your development server.
                The application will be disabled until this is resolved.
              </p>
            </div>
          </div>
        )}


        {/* Interview Settings Section */}
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 transform transition-all duration-300 hover:shadow-xl hover:scale-[1.01]">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <SparklesIcon className="text-purple-500 w-6 h-6"/> Interview Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="input-group">
              <label htmlFor="role-select" className="block text-sm font-semibold text-gray-700 mb-2">Select Interview Role:</label>
              <div className="relative">
                <select
                  id="role-select"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 pr-10"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  // Disabled based on isClientReady to ensure API calls can be made
                  disabled={!isClientReady || isLoadingQuestion || isLoadingFeedback || isSpeakingAI || isListeningUser || interviewStarted}
                >
                  <option value="SDE">SDE (Software Development Engineer)</option>
                  <option value="HR">HR (Human Resources)</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Data Scientist">Data Scientist</option>
                  <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 6.757 7.586 5.343 9z"/></svg>
                </div>
              </div>
            </div>
            <div className="input-group">
              <label htmlFor="round-type-select" className="block text-sm font-semibold text-gray-700 mb-2">Select Interview Round Type:</label>
              <div className="relative">
                <select
                  id="round-type-select"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 pr-10"
                  value={selectedRound}
                  onChange={(e) => setSelectedRound(e.target.value)}
                  // Disabled based on isClientReady to ensure API calls can be made
                  disabled={!isClientReady || isLoadingQuestion || isLoadingFeedback || isSpeakingAI || isListeningUser || interviewStarted}
                >
                  <option value="Technical">Technical</option>
                  <option value="Behavioral">Behavioral</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 6.757 7.586 5.343 9z"/></svg>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 text-center">
            <button
              onClick={handleStartInterview}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md"
              // Disable if client not ready
              disabled={!isClientReady || isLoadingQuestion || isSpeakingAI || isListeningUser || interviewStarted}
            >
              {isLoadingQuestion ? 'Starting Interview...' : 'Start Interview'}
            </button>
          </div>
        </div>

        {/* Interview Area */}
        {interviewStarted && (
          <div id="interview-area" className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <MessageSquareTextIcon className="text-indigo-500 w-6 h-6"/> Your Interview <span className="text-base font-normal text-gray-500 ml-2">(Question {interviewRoundCount})</span>
            </h2>
            
            {/* Question Display */}
            <div className="bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl p-5 mb-6 shadow-sm relative min-h-[100px] flex flex-col justify-center items-center text-center text-xl font-medium leading-relaxed">
              {isLoadingQuestion ? (
                <div className="spinner-large"></div>
              ) : (
                <p>{currentQuestion}</p>
              )}
              {!isLoadingQuestion && currentQuestion && (
                <button
                  onClick={() => speakText(currentQuestion)}
                  className="absolute bottom-3 right-3 px-4 py-2 bg-indigo-600 text-white rounded-full text-base shadow-md hover:bg-indigo-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Replay Question"
                  disabled={isSpeakingAI || isListeningUser}
                >
                  <PlayIcon size={18}/> {isSpeakingAI ? 'Speaking...' : 'Speak'}
                </button>
              )}
            </div>
            {isSpeakingAI && <p className="text-sm text-indigo-700 text-center mb-4 font-medium animate-pulse">AI is speaking...</p>}

            {/* User Answer Input */}
            <div className="input-group mb-6">
              <label htmlFor="user-answer-input" className="block text-sm font-semibold text-gray-700 mb-2">Your Answer:</label>
              <textarea
                id="user-answer-input"
                rows="7"
                className="w-full p-4 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-gray-800 text-base shadow-sm"
                placeholder="Type your answer here or click 'Speak Your Answer' to use your microphone..."
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={isLoadingFeedback || isLoadingQuestion || isSpeakingAI || isListeningUser}
              ></textarea>
            </div>

            {/* Speech Input Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <button
                onClick={startListening}
                className="flex-1 bg-purple-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md"
                disabled={isListeningUser || isLoadingQuestion || isLoadingFeedback || isSpeakingAI}
              >
                {isListeningUser ? <Loader2Icon className="animate-spin" size={20}/> : <MicIcon size={20}/>}
                {isListeningUser ? 'Listening...' : 'Speak Your Answer'}
              </button>
              {isListeningUser && (
                <button
                  onClick={stopListening}
                  className="flex-1 bg-red-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md"
                  disabled={!isListeningUser}
                >
                  <SquareIcon size={20}/> Stop Listening
                </button>
              )}
            </div>

            {liveTranscript && (
              <div className="mt-2 p-3 bg-gray-100 text-gray-700 rounded-lg text-sm italic border border-gray-200">
                <p>You are speaking: "<span className="font-semibold text-gray-900">{liveTranscript}</span>"</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-8 text-center">
              <button
                onClick={handleSubmitAnswer}
                className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md"
                disabled={isLoadingFeedback || isLoadingQuestion || isSpeakingAI || isListeningUser || !userAnswer.trim()}
              >
                {isLoadingFeedback ? <Loader2Icon className="animate-spin" size={20}/> : <CircleCheckIcon size={20}/>}
                {isLoadingFeedback ? 'Getting Feedback...' : 'Submit Answer & Next Question'}
              </button>
            </div>

            {isLoadingFeedback && (
              <div className="text-center mt-6">
                <Loader2Icon className="animate-spin text-purple-500 mx-auto" size={40}/>
                <p className="text-gray-600 mt-2">Generating personalized feedback and next question...</p>
              </div>
            )}

            {/* Feedback Display */}
            {feedback && (
              <div className="feedback-box bg-green-50 text-green-800 border border-green-200 rounded-xl p-5 mt-8 shadow-sm relative text-base leading-relaxed">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                    <SparklesIcon className="text-green-600 w-5 h-5"/> Feedback for your Answer
                </h3>
                <p>{feedback}</p>
                 <button
                  onClick={() => speakText(feedback)}
                  className="absolute bottom-3 right-3 px-4 py-2 bg-green-600 text-white rounded-full text-base shadow-md hover:bg-green-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Replay Feedback"
                  disabled={isSpeakingAI || isListeningUser}
                >
                  <PlayIcon size={18}/> {isSpeakingAI ? 'Speaking...' : 'Speak'}
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="error-box bg-red-50 text-red-800 border border-red-200 rounded-xl p-5 mt-8 shadow-sm flex items-start gap-2 text-base leading-relaxed">
                <XCircleIcon className="text-red-600 flex-shrink-0 mt-1" size={20}/>
                <div>
                    <h3 className="font-bold text-lg mb-1">Error:</h3>
                    <p>{error}</p>
                </div>
              </div>
            )}

            {/* End Interview Button */}
            <div className="mt-8 text-center">
                <button
                    onClick={handleEndInterview}
                    className="w-full bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md"
                >
                    <XIcon size={20}/> End Interview
                </button>
            </div>

          </div>
        )}
        {!interviewStarted && (
           <p className="text-center text-gray-500 mt-6 text-lg">
              Select your role and round type above and click '<span className="font-semibold text-indigo-600">Start Interview</span>' to begin your practice session.
           </p>
        )}
      </div>
    </div>
  );
}

export default App;
