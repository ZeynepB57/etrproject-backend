const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL bağlantısı
const pool = new Pool({
  connectionString: `postgresql://demopostgre:XfFZGg4dHmXxkKoA6gBmdl7YDwy2SgNn@dpg-ctt6iqdumphs73fs1qig-a.oregon-postgres.render.com/demopostgre`+"?sslmode=require"
});

// SSL doğrulamasını devre dışı bırakmak için https.Agent kullanma
const agent = new https.Agent({
  rejectUnauthorized: false  // SSL doğrulamasını devre dışı bırakır
});

// Token almak için API URL
const TOKEN_URL = "https://efatura.etrsoft.com/fmi/data/v1/databases/testdb/sessions";

// Verileri çekip veritabanına ekle
const fetchDataAndInsert = async () => {
  try {
    console.log("Token alınıyor...");
    
    // Token almak için POST isteği
    const tokenResponse = await axios.post(TOKEN_URL, {}, {
      httpsAgent: agent, // SSL doğrulaması devre dışı bırakıldı
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from('apitest:test123').toString('base64')
      }
    });

    const token = tokenResponse.data.response.token; // Tokenı al

    console.log("Token alındı:", token);

    // Veri çekme işlemi için URL
    const FETCH_DATA_URL = "https://efatura.etrsoft.com/fmi/data/v1/databases/testdb/layouts/testdb/records/1";

    console.log("Veriler çekiliyorr...");
    
    // API'den veri çekme işlemi
    const apiResponse = await axios.patch(FETCH_DATA_URL, {
      fieldData: {},
      script: "getData",
    }, {
      httpsAgent: agent, // SSL doğrulaması devre dışı bırakıldı
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Token'ı header'a ekle
      }
    });

    console.log("Çekilen Veriler:", apiResponse.data);

    // Gelen veriyi işleme
    const data = JSON.parse(apiResponse.data.response.scriptResult);
    console.log("Parse edilen veriler:", data);

    // Verileri veritabanına ekle
    for (const item of data) {
      const { hesap_kodu, borc } = item; // İlgili veriyi al

      // Veriyi kontrol et ve ekle/güncelle
      const result = await pool.query(
        'SELECT * FROM accounts WHERE account_code = $1', 
        [hesap_kodu]
      );

      if (result.rows.length > 0) {
        // Eğer kayıt varsa, güncelle
        await pool.query(
          'UPDATE accounts SET account_balance = $1 WHERE account_code = $2',
          [borc || 0, hesap_kodu]
        );
      } else {
        // Eğer kayıt yoksa, ekle
        await pool.query(
          'INSERT INTO accounts (account_code, account_balance) VALUES ($1, $2)',
          [hesap_kodu, borc || 0]
        );
      }
    }

    console.log("Veriler başarıyla veritabanına eklendi.");
  } catch (error) {
    console.error("Veri çekme veya ekleme sırasında hata oluştu:", error.message);

    if (error.response) {
      console.error("Hata Yanıtı:", error.response.status, error.response.data);
    } else if (error.request) {
      console.error("API isteği gönderildi ancak yanıt alınamadı:", error.request);
    }
  }
};

// API verilerini eklemek için otomatik olarak her dakika çağır
setInterval(fetchDataAndInsert, 30000); // 60000ms = 1 dakika

// Veritabanından verileri çek
app.get('/api/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts');
    res.json(result.rows); // Verileri JSON formatında döndür
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Veritabanı sorgusunda hata oluştu!' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor.`);
});
