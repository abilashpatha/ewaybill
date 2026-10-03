import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { SCANS_DIR } from '../middleware/upload.js';
import db from '../db/database.js';

const SYSTEM_PROMPT = `Extract e-waybill fields from the image. Return ONLY valid JSON, no markdown, no explanation. Use empty string for missing fields.
{"supplyType":"O/I","subSupplyType":"1-11","docType":"INV/BIL/CHL","docNo":"","docDate":"DD/MM/YYYY","fromGstin":"","fromTradeName":"","fromAddr1":"","fromAddr2":"","fromPlace":"","fromPincode":"","fromStateCode":"","toGstin":"","toTradeName":"","toAddr1":"","toAddr2":"","toPlace":"","toPincode":"","toStateCode":"","productName":"","productDesc":"","hsnCode":"","quantity":"","qtyUnit":"","taxableAmount":"","cgstRate":"","sgstRate":"","igstRate":"","cessRate":"","transportMode":"1=Road 2=Rail 3=Air 4=Ship","transDistance":"","transporterId":"","transporterName":"","vehicleNo":"","vehicleType":"R/O"}`;

export async function extractFieldsFromImage(req, res) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { image } = req.body;
    if (!image) return res.status(400).json({ success: false, error: 'No image provided' });

    // OCR scan is free — no wallet deduction

    const base64    = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

    // Save scan to disk
    const ext          = mediaType.split('/')[1] || 'jpg';
    const scanFilename = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(SCANS_DIR, scanFilename), Buffer.from(base64, 'base64'));

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: 'Extract fields.' },
        ],
      }],
    });

    const text      = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const fields = JSON.parse(jsonMatch[0]);

    const u = response.usage;
    console.log(`[OCR] tokens in=${u.input_tokens} out=${u.output_tokens} total=${u.input_tokens + u.output_tokens}`);

    res.json({ success: true, fields, scan_filename: scanFilename });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
