import { BASE_URL, getStoredToken, handleResponse } from './client';

export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const compressImageForOcr = (
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<{ base64Data: string; mimeType: string; dataUrl: string }> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      try {
        const dUrl = await readFileAsDataUrl(file);
        resolve({
          base64Data: dUrl.split(',')[1] || '',
          mimeType: file.type || 'image/jpeg',
          dataUrl: dUrl,
        });
      } catch {
        resolve({ base64Data: '', mimeType: file.type || 'image/jpeg', dataUrl: '' });
      }
    }, 4000);

    if (!file.type || !file.type.startsWith('image/')) {
      clearTimeout(timeout);
      readFileAsDataUrl(file)
        .then((dataUrl) => {
          resolve({
            base64Data: dataUrl.split(',')[1] || '',
            mimeType: file.type || 'image/jpeg',
            dataUrl,
          });
        })
        .catch(() => {
          resolve({ base64Data: '', mimeType: file.type || 'image/jpeg', dataUrl: '' });
        });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = typeof e.target?.result === 'string' ? e.target.result : '';
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeout);
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({
              base64Data: compressedDataUrl.split(',')[1] || '',
              mimeType: 'image/jpeg',
              dataUrl: compressedDataUrl,
            });
            return;
          }
        } catch { }
        resolve({
          base64Data: rawUrl.split(',')[1] || '',
          mimeType: file.type || 'image/jpeg',
          dataUrl: rawUrl,
        });
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve({
          base64Data: rawUrl.split(',')[1] || '',
          mimeType: file.type || 'image/jpeg',
          dataUrl: rawUrl,
        });
      };
      img.src = rawUrl;
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      resolve({ base64Data: '', mimeType: '', dataUrl: '' });
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Single-file OCR scan routing to backend OCR scanning engines.
 * Supports both JSON base64 payloads (required by Vercel Serverless) and multipart FormData.
 */
export const scanScoresheetOCR = async (file: File): Promise<any> => {
  // 1. Prepare base64 representation for serverless backend compatibility (Vercel Node)
  let base64Payload = '';
  let payloadMime = file.type || 'image/jpeg';

  try {
    if (file.type && file.type.startsWith('image/')) {
      const comp = await compressImageForOcr(file, 1600, 0.8);
      base64Payload = comp.base64Data;
      payloadMime = comp.mimeType || file.type || 'image/jpeg';
    } else {
      const dUrl = await readFileAsDataUrl(file);
      base64Payload = dUrl.split(',')[1] || '';
      payloadMime = file.type || (file.name.endsWith('.csv') ? 'text/csv' : 'application/pdf');
    }
  } catch {
    const dUrl = await readFileAsDataUrl(file);
    base64Payload = dUrl.split(',')[1] || '';
  }

  const endpoints = [
    `${BASE_URL}/matches/scan-scoresheet`,
    `${BASE_URL}/matches/ocr/scan`,
    `${BASE_URL}/matches/web/scan-scoresheet`,
  ];

  let lastError: Error | null = null;

  for (const ep of endpoints) {
    // Attempt 1: Multipart FormData without auth header (to prevent optionalAuth duplicate next() bug)
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('scoresheet', file, file.name);

      const formRes = await fetch(ep, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      if (formRes.ok) {
        return await handleResponse<any>(formRes);
      }

      const errTxt = await formRes.text().catch(() => '');
      if (formRes.status !== 404) {
        lastError = new Error(`OCR scanner returned status ${formRes.status}: ${errTxt}`);
      }
    } catch (err: any) {
      lastError = err;
    }

    // Attempt 2: JSON Base64 Payload without auth header
    if (base64Payload) {
      try {
        const jsonRes = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            base64: base64Payload,
            filename: file.name,
            mimetype: payloadMime,
          }),
        });

        if (jsonRes.ok) {
          return await handleResponse<any>(jsonRes);
        }

        const errTxt = await jsonRes.text().catch(() => '');
        if (jsonRes.status !== 404) {
          lastError = new Error(`OCR scanner returned status ${jsonRes.status}: ${errTxt}`);
        }
      } catch (err: any) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Failed to connect to backend OCR scanner. Please make sure the backend server is reachable.');
};

export const scanScoresheetStandalone = async (rawFile: File): Promise<any> => {
  return await scanScoresheetOCR(rawFile);
};

export const scanScoresheetClientDirect = async (
  rawFile: File,
  _homeTeam = 'Home Team',
  _awayTeam = 'Away Team',
  _sport = 'Basketball'
): Promise<any> => {
  return await scanScoresheetStandalone(rawFile);
};

/**
 * Multi-file scoresheet OCR scan routing directly to the backend multi-scoresheet engine
 * (aligned with mobile canonical endpoint: /matches/mobile/multi/scan-scoresheet)
 */
export const scanMultipleScoresheets = async (files: File[]): Promise<any> => {
  if (!files || files.length === 0) return null;
  if (files.length === 1) return scanScoresheetOCR(files[0]);

  const formData = new FormData();
  files.forEach((f) => {
    formData.append('files', f);
  });

  const endpoints = [
    `${BASE_URL}/matches/mobile/multi/scan-scoresheet`,
    `${BASE_URL}/matches/multi/scan-scoresheet`,
    `${BASE_URL}/matches/web/multi/scan-scoresheet`,
  ];

  let lastError: Error | null = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      if (res.ok) {
        return await handleResponse<any>(res);
      } else {
        const errTxt = await res.text().catch(() => '');
        lastError = new Error(`Multi-scoresheet OCR scanner returned status ${res.status}: ${errTxt}`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  // Fallback: If dedicated multi-scan endpoint returns 404 on deployed backend,
  // scan each file individually via the active scanScoresheetOCR endpoint and combine
  try {
    const subMatches: any[] = [];
    for (const f of files) {
      const singleRes = await scanScoresheetOCR(f);
      if (singleRes) {
        subMatches.push(singleRes);
      }
    }
    if (subMatches.length > 0) {
      return {
        success: true,
        matches: subMatches,
        pages: subMatches,
        total_scoresheets_processed: subMatches.length,
      };
    }
  } catch (individualErr: any) {
    lastError = individualErr;
  }

  throw lastError || new Error('Failed to connect to backend multi-scoresheet scanner. Please verify network connectivity.');
};

export const uploadScoresheetFile = async (matchId: string, rawFile: File): Promise<any> => {
  const cleanId = matchId.replace(/^#/, '');
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('file', rawFile, rawFile.name);
  formData.append('scoresheet', rawFile, rawFile.name);

  // Attempt without auth header first to avoid backend optionalAuth duplicate next() bug
  try {
    const res = await fetch(`${BASE_URL}/matches/${cleanId}/scoresheet`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
    });
    if (res.ok) {
      return await handleResponse<any>(res);
    }
  } catch {}

  // Secondary attempt with token
  const res = await fetch(`${BASE_URL}/matches/${cleanId}/scoresheet`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (res.ok) {
    return await handleResponse<any>(res);
  }

  return await scanScoresheetStandalone(rawFile);
};

export const uploadMultipleScoresheetFiles = async (matchId: string, files: File[]): Promise<any> => {
  if (!files || files.length === 0) return null;
  if (files.length === 1) return uploadScoresheetFile(matchId, files[0]);

  const cleanId = matchId.replace(/^#/, '');
  const token = getStoredToken();
  const formData = new FormData();
  files.forEach((f) => {
    formData.append('files', f, f.name);
  });

  // Attempt without auth header first
  try {
    const res = await fetch(`${BASE_URL}/matches/${cleanId}/multi/scoresheet`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
    });
    if (res.ok) {
      return await handleResponse<any>(res);
    }
  } catch {}

  try {
    const res = await fetch(`${BASE_URL}/matches/${cleanId}/multi/scoresheet`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (res.ok) {
      return await handleResponse<any>(res);
    }
  } catch (err) {
    console.warn('Multi match scoresheet upload failed:', err);
  }

  return scanMultipleScoresheets(files);
};

export const submitVerifiedMatch = async (payload: any): Promise<any> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/matches/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<any>(res);
};
