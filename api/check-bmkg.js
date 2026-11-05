import { createClient } from '@supabase/supabase-js';

// Inisialisasi koneksi ke Supabase menggunakan Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    // 1. Ambil data gempa terbaru dari API publik BMKG
    const bmkgResponse = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
    const bmkgData = await bmkgResponse.json();
    const gempaBmkg = bmkgData.Infogempa.gempa;

    // Parse koordinat Lintang dan Bujur dari BMKG (Format BMKG: "Lat,Long")
    const [lat, long] = gempaBmkg.Coordinates.split(',');
    const bmkgDateTime = new Date(gempaBmkg.DateTime).toISOString();

    // 2. Cek gempa terakhir yang sudah tersimpan di database Supabase
    const { data: latestSaved, error: fetchError } = await supabase
      .from('earthquakes')
      .select('datetime')
      .order('datetime', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Gagal membaca data dari Supabase: ${fetchError.message}`);
    }

    // 3. Bandingkan tanggal/waktu gempa BMKG dengan data terakhir di database
    const isNewEarthquake = !latestSaved || new Date(bmkgDateTime) > new Date(latestSaved.datetime);

    if (isNewEarthquake) {
      // Jika gempa baru, lakukan INSERT ke tabel earthquakes
      const { error: insertError } = await supabase.from('earthquakes').insert([
        {
          tanggal: gempaBmkg.Tanggal,
          jam: gempaBmkg.Jam,
          datetime: bmkgDateTime,
          coordinates: `(${long}, ${lat})`, // Format Point PostgreSQL: (Longitude, Latitude)
          magnitude: parseFloat(gempaBmkg.Magnitude),
          kedalaman: gempaBmkg.Kedalaman,
          wilayah: gempaBmkg.Wilayah,
          potensi: gempaBmkg.Potensi,
          dirasakan: gempaBmkg.Dirasakan || 'Tidak ada laporan',
        },
      ]);

      if (insertError) {
        throw new Error(`Gagal menyimpan gempa baru: ${insertError.message}`);
      }

      return res.status(200).json({
        status: 'success',
        message: 'Gempa baru terdeteksi dan berhasil disimpan ke Supabase!',
        data: gempaBmkg,
      });
    }

    // Jika tidak ada gempa baru
    return res.status(200).json({
      status: 'success',
      message: 'Tidak ada gempa baru. Data Supabase sudah up-to-date.',
    });
  } catch (error) {
    console.error('Error on check-bmkg:', error.message);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}