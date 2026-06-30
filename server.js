// server.js - Moon Studio Backend
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SUPABASE SETUP
// ============================================
const supabaseUrl = 'https://wuyvebiuqtjklqlbmrmes.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1eWViaXVxdGprbHFsYm1ybWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTc5NTcsImV4cCI6MjA5ODM3Mzk1N30.37Z-swkBlmEVfmaJsO3BsCXk2LdHtj1yXWN1oJrYIRw';

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Moon Studio API is running!' });
});

// Upload video
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const { title, description } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `video_${timestamp}_${randomStr}.mp4`;

        console.log(`📤 Uploading: ${fileName}, Size: ${req.file.size} bytes`);

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, req.file.buffer, {
                contentType: 'video/mp4',
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('❌ Storage Error:', uploadError);
            return res.status(500).json({ error: `Storage error: ${uploadError.message}` });
        }

        console.log('✅ File uploaded to storage');

        // Get public URL
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/${fileName}`;

        // Insert into database
        const { data: dbData, error: dbError } = await supabase
            .from('videos')
            .insert([{
                title: title.trim(),
                description: (description || '').trim(),
                file_path: publicUrl,
                file_name: fileName,
                uploaded_at: new Date().toISOString()
            }])
            .select();

        if (dbError) {
            // Delete uploaded file if database insert fails
            await supabase.storage.from('videos').remove([fileName]);
            console.error('❌ Database Error:', dbError);
            return res.status(500).json({ error: `Database error: ${dbError.message}` });
        }

        console.log('✅ Metadata saved to database');

        res.status(200).json({
            success: true,
            message: 'Video uploaded successfully!',
            data: {
                fileName: fileName,
                url: publicUrl,
                title: title,
                id: dbData[0]?.id
            }
        });

    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Get all videos
app.get('/api/videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .order('uploaded_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({
            success: true,
            data: data || []
        });

    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Moon Studio API running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📤 Upload endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`📺 Videos endpoint: http://localhost:${PORT}/api/videos`);
});

module.exports = app;