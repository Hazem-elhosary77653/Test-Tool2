import { Loader2 } from 'lucide-react';

export const Button = ({ children, className = '', variant = 'default', size = 'md', isLoading = false, disabled = false, ...props }) => {
  const variants = {
    default: 'bg-primary text-white hover:bg-primary-dark',
    secondary: 'bg-secondary text-white hover:bg-opacity-90',
    outline: 'border border-primary text-primary hover:bg-primary hover:text-white bg-white',
    ghost: 'hover:bg-gray-100 text-primary',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`rounded-lg font-semibold transition-all cursor-pointer border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
};
