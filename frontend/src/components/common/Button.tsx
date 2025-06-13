import React, { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  fullWidth = false,
  className = '',
  disabled,
  ...rest
}) => {
  // Base classes
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md focus:outline-none transition-colors';
  
  // Size classes
  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
    success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2',
    info: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2'
  };
  
  // Disabled classes
  const disabledClasses = 'opacity-50 cursor-not-allowed';
  
  // Full width class
  const widthClass = fullWidth ? 'w-full' : '';
  
  return (
    <button
      className={`
        ${baseClasses}
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${disabled || isLoading ? disabledClasses : ''}
        ${widthClass}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;