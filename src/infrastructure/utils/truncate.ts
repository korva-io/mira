// Interface for flexible JSON input
interface JsonItem {
  [key: string]: any;
}

// Configuration
const MAX_FIELD_LENGTH = 50;
const MAX_ARRAY_ELEMENTS = 1; // Keep only first element in arrays

// Function to check if a string is valid JSON
function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Function to convert MongoDB _id to string
function convertMongoId(id: any): string {
  if (!id) return '';
  
  // If it's already a string, return it (remove any surrounding quotes)
  if (typeof id === 'string') {
    return id.replace(/^"|"$/g, '');
  }
  
  // If it has a buffer property, it's a MongoDB ObjectId
  if (id.buffer && Array.isArray(id.buffer.data)) {
    // Convert buffer to hex string
    return id.buffer.data.map((b: number) => b.toString(16).padStart(2, '0')).join('');
  }
  
  // If it's an object with $oid, it's a MongoDB ObjectId in extended JSON format
  if (id.$oid) return id.$oid;
  
  // If it's a simple object, try to stringify it and remove quotes
  const str = JSON.stringify(id);
  return str.replace(/^"|"$/g, '');
}

// Function to safely truncate a JSON string
function truncateJsonString(jsonString: string): string {
  if (jsonString.length <= MAX_FIELD_LENGTH) {
    // Pad with spaces if needed to reach MAX_FIELD_LENGTH
    return jsonString.padEnd(MAX_FIELD_LENGTH, ' ');
  }

  try {
    const obj = JSON.parse(jsonString);
    const truncated = truncateValue(obj);
    const result = JSON.stringify(truncated);
    
    // If the result is still too long, we need to truncate it
    if (result.length > MAX_FIELD_LENGTH) {
      // Find the last complete property that fits within MAX_FIELD_LENGTH
      let truncatedString = result.slice(0, MAX_FIELD_LENGTH);
      const lastComma = truncatedString.lastIndexOf(',');
      if (lastComma > 0) {
        truncatedString = truncatedString.slice(0, lastComma) + '}';
      } else {
        // If no comma found, we need to find the last complete key-value pair
        const lastColon = truncatedString.lastIndexOf(':');
        if (lastColon > 0) {
          const lastQuote = truncatedString.lastIndexOf('"', lastColon);
          if (lastQuote > 0) {
            truncatedString = truncatedString.slice(0, lastQuote) + '}';
          } else {
            truncatedString = '{}';
          }
        } else {
          truncatedString = '{}';
        }
      }
      // Pad with spaces if needed to reach MAX_FIELD_LENGTH
      return truncatedString.padEnd(MAX_FIELD_LENGTH, ' ');
    }
    // Pad with spaces if needed to reach MAX_FIELD_LENGTH
    return result.padEnd(MAX_FIELD_LENGTH, ' ');
  } catch {
    // If parsing fails, return a simple truncated string padded to MAX_FIELD_LENGTH
    return (jsonString.slice(0, MAX_FIELD_LENGTH - 2) + '{}').padEnd(MAX_FIELD_LENGTH, ' ');
  }
}

// Function to truncate a value (string or JSON)
function truncateValue(value: any): any {
  if (typeof value === 'string') {
    if (isValidJSON(value)) {
      return truncateJsonString(value);
    }
    return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    // For arrays, keep only the first element and truncate it
    return [truncateValue(value[0])];
  }
  
  if (typeof value === 'object' && value !== null) {
    // Special handling for MongoDB _id
    if (Object.keys(value).length === 1 && '_id' in value) {
      return { _id: convertMongoId(value._id) };
    }
    
    // Recursively truncate nested objects
    const truncatedObj: JsonItem = {};
    for (const [k, v] of Object.entries(value)) {
      // Special handling for _id field
      if (k === '_id') {
        truncatedObj[k] = convertMongoId(v);
      } else {
        truncatedObj[k] = truncateValue(v);
      }
    }
    return truncatedObj;
  }
  
  return value;
}

// Function to truncate long fields in a JSON item
export function truncateJsonFields(item: JsonItem): JsonItem {
  if (!item || typeof item !== 'object') {
    return item;
  }
  return truncateValue(item);
}

// Function to truncate a list of JSON items
export function truncateValueList(values: JsonItem[]): JsonItem[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((item) => truncateJsonFields(item));
}
