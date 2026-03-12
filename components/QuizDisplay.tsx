import React, { useState } from 'react';
import { QuizQuestion } from '../types';
import { CheckCircle, XCircle, RefreshCw, Trophy } from 'lucide-react';

interface QuizDisplayProps {
  questions: QuizQuestion[];
  onRetake: () => void;
}

const QuizDisplay: React.FC<QuizDisplayProps> = ({ questions, onRetake }) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const handleOptionClick = (index: number) => {
    if (isRevealed) return;
    setSelectedOption(index);
    setIsRevealed(true);
    
    if (index === questions[currentQ].correctIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(c => c + 1);
      setSelectedOption(null);
      setIsRevealed(false);
    } else {
      setShowSummary(true);
    }
  };

  if (showSummary) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in">
        <Trophy className={`w-20 h-20 mb-4 ${score > 3 ? 'text-yellow-400' : 'text-gray-500'}`} />
        <h3 className="text-2xl font-bold text-white mb-2">Quiz Complete!</h3>
        <p className="text-neuro-text mb-6">You scored <span className="text-neuro-primary font-bold">{score}</span> out of {questions.length}</p>
        <button 
          onClick={onRetake}
          className="flex items-center space-x-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw size={18} />
          <span>Generate New Quiz</span>
        </button>
      </div>
    );
  }

  const question = questions[currentQ];

  return (
    <div className="max-w-3xl mx-auto py-6 animate-in slide-in-from-right-4">
      <div className="mb-6 flex justify-between items-center text-sm text-gray-500 font-mono">
        <span>QUESTION {currentQ + 1} OF {questions.length}</span>
        <span>SCORE: {score}</span>
      </div>

      <h3 className="text-xl font-medium text-white mb-6 leading-relaxed">
        {question.question}
      </h3>

      <div className="space-y-3 mb-8">
        {question.options.map((opt, idx) => {
          let stateClass = "border-gray-700 bg-gray-800/50 hover:bg-gray-800";
          
          if (isRevealed) {
            if (idx === question.correctIndex) {
              stateClass = "border-green-500 bg-green-900/20";
            } else if (idx === selectedOption) {
              stateClass = "border-red-500 bg-red-900/20";
            } else {
              stateClass = "border-gray-800 opacity-50";
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleOptionClick(idx)}
              className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${stateClass} ${isRevealed ? 'cursor-default' : 'cursor-pointer hover:border-gray-500'}`}
            >
              <div className="flex items-center">
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center mr-3 shrink-0 ${
                  isRevealed && idx === question.correctIndex ? 'border-green-500 bg-green-500 text-black' : 
                  isRevealed && idx === selectedOption ? 'border-red-500 text-red-500' : 'border-gray-600 text-gray-400'
                }`}>
                  {isRevealed && idx === question.correctIndex ? <CheckCircle size={14} /> : 
                   isRevealed && idx === selectedOption ? <XCircle size={14} /> : 
                   <span className="text-xs">{String.fromCharCode(65 + idx)}</span>}
                </div>
                <span className={isRevealed && idx === question.correctIndex ? 'text-green-100' : 'text-gray-300'}>
                  {opt}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {isRevealed && (
        <div className="bg-neuro-surface border-l-4 border-neuro-primary p-4 rounded-r-lg mb-6 animate-in fade-in">
          <h4 className="text-sm font-bold text-neuro-primary mb-1">EXPLANATION</h4>
          <p className="text-gray-300 text-sm">{question.explanation}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!isRevealed}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            isRevealed 
              ? 'bg-neuro-primary hover:bg-neuro-primaryHover text-white shadow-lg' 
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {currentQ === questions.length - 1 ? "Finish Quiz" : "Next Question"}
        </button>
      </div>
    </div>
  );
};

export default QuizDisplay;