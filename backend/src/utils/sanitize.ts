/**
 * HTML sanitization utilities
 * Helps prevent XSS attacks by sanitizing user input
 */

// List of allowed HTML tags
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'b', 'i', 'strong', 'em', 'code', 'pre',
  'a', 'span', 'div'
];

// List of allowed HTML attributes
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'title', 'target'],
  span: ['class'],
  div: ['class'],
  code: ['class'],
  pre: ['class']
};

// Regular expressions for sanitization
const STRIP_TAGS_REGEX = /<\/?([^>]+)>/gi;
const STRIP_COMMENTS_REGEX = /<!--[\s\S]*?-->/g;
const STRIP_ATTRIBUTES_REGEX = /\s+([^=]+)=["']([^"']*)["']/g;

/**
 * Sanitize HTML content
 * @param html HTML content to sanitize
 * @returns Sanitized HTML content
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }
  
  // Convert to string if not already
  const input = String(html);
  
  // Remove HTML comments
  let sanitized = input.replace(STRIP_COMMENTS_REGEX, '');
  
  // Process tags and attributes
  sanitized = sanitized.replace(STRIP_TAGS_REGEX, (match, tag) => {
    // Extract tag name (without attributes)
    const tagName = tag.split(' ')[0].toLowerCase();
    
    // Check if tag is allowed
    if (ALLOWED_TAGS.includes(tagName)) {
      // For opening tags, process attributes
      if (!match.includes('/')) {
        // Start with the tag name
        let sanitizedTag = `<${tagName}`;
        
        // Process attributes if this tag has allowed attributes
        if (ALLOWED_ATTRIBUTES[tagName as keyof typeof ALLOWED_ATTRIBUTES]) {
          const allowedAttrs = ALLOWED_ATTRIBUTES[tagName as keyof typeof ALLOWED_ATTRIBUTES];
          
          // Extract attributes
          const attributes: Array<[string, string]> = [];
          let attrMatch;
          while ((attrMatch = STRIP_ATTRIBUTES_REGEX.exec(match)) !== null) {
            const [, name, value] = attrMatch;
            attributes.push([name.toLowerCase(), value]);
          }
          
          // Add allowed attributes
          for (const [name, value] of attributes) {
            if (allowedAttrs.includes(name)) {
              // Special handling for href attributes to prevent javascript: URLs
              if (name === 'href' && (value.toLowerCase().startsWith('javascript:') || value.toLowerCase().startsWith('data:'))) {
                continue;
              }
              
              // Add the attribute
              sanitizedTag += ` ${name}="${escapeHtml(value)}"`;
            }
          }
        }
        
        return `${sanitizedTag}>`;
      }
      
      // Closing tag
      return `</${tagName}>`;
    }
    
    // Tag not allowed, remove it
    return '';
  });
  
  return sanitized;
}

/**
 * Escape HTML special characters
 * @param text Text to escape
 * @returns Escaped text
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a plain text string (no HTML allowed)
 * @param text Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeText(text: string): string {
  if (!text) {
    return '';
  }
  
  return escapeHtml(String(text));
}