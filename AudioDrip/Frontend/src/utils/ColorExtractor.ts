export function extractDominantColors(imageUrl: string): Promise<{ primary: string; secondary: string }> {
  return new Promise((resolve) => {
    // If no cover art, return default fallbacks
    if (!imageUrl) {
      resolve({ primary: '#F59E0B', secondary: '#E11D72' });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 4;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ primary: '#F59E0B', secondary: '#E11D72' });
          return;
        }

        ctx.drawImage(img, 0, 0, 4, 4);
        const imgData = ctx.getImageData(0, 0, 4, 4).data;

        // Group pixels into distinct clusters
        const colors: { r: number; g: number; b: number; count: number }[] = [];
        
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];
          
          if (a < 180) continue; // Skip semi-transparent pixels

          let found = false;
          for (const c of colors) {
            const dist = Math.hypot(c.r - r, c.g - g, c.b - b);
            if (dist < 45) { // Group similar colors together
              c.r = (c.r * c.count + r) / (c.count + 1);
              c.g = (c.g * c.count + g) / (c.count + 1);
              c.b = (c.b * c.count + b) / (c.count + 1);
              c.count++;
              found = true;
              break;
            }
          }

          if (!found) {
            colors.push({ r, g, b, count: 1 });
          }
        }

        // Sort by counts descending
        colors.sort((a, b) => b.count - a.count);

        const toHex = (rgb: { r: number; g: number; b: number }) => {
          const rHex = Math.round(rgb.r).toString(16).padStart(2, '0');
          const gHex = Math.round(rgb.g).toString(16).padStart(2, '0');
          const bHex = Math.round(rgb.b).toString(16).padStart(2, '0');
          return `#${rHex}${gHex}${bHex}`;
        };

        const primary = colors.length > 0 ? toHex(colors[0]) : '#F59E0B';
        let secondary = '#E11D72';
        
        if (colors.length > 1) {
          secondary = toHex(colors[1]);
        } else if (colors.length === 1) {
          // Fallback shifting hue for contrast if only one cluster found
          const c = colors[0];
          secondary = toHex({ 
            r: (c.r + 60) % 256, 
            g: (c.g + 120) % 256, 
            b: (c.b + 180) % 256 
          });
        }

        resolve({ primary, secondary });
      } catch {
        resolve({ primary: '#F59E0B', secondary: '#E11D72' });
      }
    };

    img.onerror = () => {
      resolve({ primary: '#F59E0B', secondary: '#E11D72' });
    };
  });
}

export function updateSkinCSSVariables(primary: string, secondary: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--skin-primary', primary);
    document.documentElement.style.setProperty('--skin-secondary', secondary);
  }
}
