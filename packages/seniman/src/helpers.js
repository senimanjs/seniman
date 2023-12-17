

function getHostname(url) {
  try {
    const urlObj = new URL(url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`);
    return urlObj.hostname;
  } catch (e) {
    console.error("Invalid URL");
    return null;
  }
}

export function buildOriginCheckerFunction(allowedOrigins) {
  allowedOrigins = allowedOrigins || [];

  if (allowedOrigins.length === 0) {
    return () => true;
  }

  // Separate the origins into regex patterns and simple strings
  const regexPatterns = [];
  const simpleOrigins = [];

  allowedOrigins.forEach(origin => {
    if (origin.includes('*')) {
      // Replace wildcard characters with regex equivalent and add to regexPatterns
      const regexPattern = origin.replace(/\*/g, '.*');
      regexPatterns.push(new RegExp('^' + regexPattern + '$'));
    } else {
      // Add bare string to simpleOrigins
      simpleOrigins.push(origin);
    }
  });


  // Return a function that checks an origin against both simple strings and regex patterns
  return function checkOrigin(origin) {
    // Only allow hostname-based origin checking for now (no port, protocol, etc.)
    let hostname = getHostname(origin);

    return simpleOrigins.includes(hostname) || regexPatterns.some(pattern => pattern.test(hostname));
  };
}
