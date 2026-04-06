const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = 7533630775;
const RO_API_KEY = process.env.RO_API_KEY;
const RO_BASE_URL = 'https://www.rumahotp.io/api';
const PROFIT_PERCENT = 15; // Artinya kamu ambil untung 15% dari harga modal

// --- DATABASE SCHEMA ---
mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, unique: true },
    username: String,
    firstName: String,
    saldo: { type: Number, default: 0 },
    role: { type: String, default: 'Member' },
    isBanned: { type: Boolean, default: false },
    statusTopup: { type: Boolean, default: false } // Tambahkan ini
}));


// profit const
const calculatePrice = (apiPrice) => {
    const markup = (apiPrice * PROFIT_PERCENT) / 100;
    const finalPrice = Math.ceil((apiPrice + markup) / 100) * 100; // Pembulatan ke atas kelipatan 100
    return finalPrice;
};


const roApi = axios.create({
    baseURL: RO_BASE_URL,
    headers: { 'x-apikey': RO_API_KEY, 'Accept': 'application/json' }
});

// --- HELPER ---
const formatIDR = (val) => `Rp ${val.toLocaleString('id-ID')}`;

const CHANNEL_ID = process.env.CHANNEL_ID;

// --- FUNGSI CEK MEMBER ---
const checkJoin = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        // Status yang dianggap sudah join: member, administrator, atau creator
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e) {
        return false;
    }
};

// --- FUNGSI KEYBOARD UTAMA ---
const mainKeyboard = (isAdmin) => {
    const btns = [
        [Markup.button.callback('🛒 Beli Nomor (Nokos)', 'list_services')],
        [Markup.button.callback('💰 Isi Saldo', 'topup_menu'), Markup.button.callback('👤 Profil', 'user_profile')],
        [Markup.button.callback('📜 Riwayat', 'history'), Markup.button.callback('📞 Support', 'support_contact')]
    ];
    
    if (isAdmin) {
        btns.push([Markup.button.callback('🛠️ Panel Owner', 'owner_panel')]);
    }
    
    return Markup.inlineKeyboard(btns);
};

// --- HANDLER START & MENU ---
const sendMainMenu = async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // 1. Ambil data user dari Database
        let user = await User.findOne({ telegramId: userId });

        // 2. Jika user baru (belum ada di DB), buatkan datanya
        if (!user) {
            user = await User.create({
                telegramId: userId,
                username: ctx.from.username || 'No Username',
                saldo: 0,
                role: 'Member', // Default Role
                statusTopup: false
            });
        }

        // 3. Cek Force Join Channel
        const isJoined = await checkJoin(ctx);
        if (!isJoined) {
            return ctx.reply(`👋 Halo ${ctx.from.first_name}!\n\nSebelum menggunakan bot **Manzzy ID**, kamu wajib bergabung di channel pusat kami terlebih dahulu.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.url('📢 Join Channel', 'https://t.me/Manzzy_ID')],
                    [Markup.button.callback('✅ SAYA SUDAH JOIN', 'verify_join')]
                ])
            });
        }

        // 4. Susun Teks Menu dengan Data Profile
        const isAdmin = userId === OWNER_ID;
        const roleUser = isAdmin ? 'Owner / Admin' : (user.role || 'Member');
        
        const menuMsg = `🎯 *MAIN MENU MANZZY ID*\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `👤 *Nama:* ${ctx.from.first_name}\n` +
                        `🆔 *ID:* \`${userId}\`\n` +
                        `💳 *Saldo:* Rp ${user.saldo.toLocaleString('id-ID')}\n` +
                        `🎖️ *Role:* ${roleUser}\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `Silakan pilih layanan di bawah ini:`;

        // Kirim Menu dengan Foto Banner
        await ctx.replyWithPhoto('https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1775385903372_357.jpg', {
            caption: menuMsg,
            parse_mode: 'Markdown',
            ...mainKeyboard(isAdmin)
        });

    } catch (e) {
        console.error("ERROR MENU:", e.message);
        ctx.reply("❌ Terjadi gangguan saat memuat menu.");
    }
};
// Command Hooks
bot.start((ctx) => sendMainMenu(ctx));
bot.command('menu', (ctx) => sendMainMenu(ctx));

// --- HANDLER VERIFIKASI (DENGAN LOADING KEREN) ---
bot.action('verify_join', async (ctx) => {
    try {
        // 1. Animasi Loading (Validasi)
        await ctx.editMessageText('🔄 *Sedang memvalidasi data...*', { parse_mode: 'Markdown' });
        
        // Kasih delay 1.5 detik biar kerasa "loading"
        await new Promise(resolve => setTimeout(resolve, 1500));

        const isJoined = await checkJoin(ctx);

        if (isJoined) {
            await ctx.answerCbQuery('✅ Verifikasi Berhasil! Selamat datang.', { show_alert: false });
            await ctx.deleteMessage(); // Hapus pesan verifikasi
            return sendMainMenu(ctx); // Kirim menu utama
        } else {
            await ctx.answerCbQuery('⚠️ Kamu belum join channel kami!', { show_alert: true });
            await ctx.editMessageText(`❌ *Verifikasi Gagal!*\n\nKamu benar-benar harus join channel dulu sebelum bisa lanjut, Bre.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.url('📢 Join Channel', 'https://t.me/manzzyidnokos')],
                    [Markup.button.callback('🔄 COBA LAGI', 'verify_join')]
                ])
            });
        }
    } catch (e) {
        ctx.reply('Terjadi kesalahan verifikasi.');
    }
});
// --- FITUR OWNER (ADD SALDO) ---
// Perintah: /addsaldo [ID] [Jumlah]
bot.command('addsaldo', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Format: /addsaldo [ID] [Jumlah]');

    const targetId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    const updated = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { saldo: amount } }, { new: true });
    if (updated) {
        ctx.reply(`✅ Berhasil! Saldo ${updated.firstName} bertambah. Total: ${formatIDR(updated.saldo)}`);
        bot.telegram.sendMessage(targetId, `💰 Saldo Anda telah ditambahkan sebesar *${formatIDR(amount)}* oleh Admin!`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('❌ User tidak ditemukan di database.');
    }
});

// --- PANEL OWNER (CEK SALDO PUSAT) ---
bot.action('owner_panel', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('Akses Ditolak!');
    try {
        const res = await roApi.get('/v1/user/balance');
        const bal = res.data.data;
        await ctx.editMessageCaption(`👑 *OWNER PANEL - Manzzy ID*\n\n💰 Saldo Pusat (RO): *${bal.formated}*\n📧 Email RO: ${bal.email}\n\n*Fitur Cepat:* \n/addsaldo [ID] [Jumlah]\n/ban [ID]`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'start_menu')]])
        });
    } catch (e) { ctx.reply('Gagal cek saldo pusat.'); }
});

// --- SISTEM BANTUAN (BOT CHAT) ---
bot.action('support', async (ctx) => {
    await ctx.editMessageCaption('📝 *Sistem Tiket Bantuan*\n\nSilakan ketik pesan/kendala Anda di sini. Pesan Anda akan langsung terkirim ke Owner.', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'start_menu')]])
    });
    // Set session atau state user sedang mode bertanya (bisa pakai session middleware, tapi ini cara simpelnya)
    return ctx.answerCbQuery();
});

// Menangani pesan teks yang bukan perintah (Untuk Chat Support)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // Abaikan perintah

    // Jika Owner membalas pesan terusan (Reply pesan dari bot)
    if (ctx.from.id === OWNER_ID && ctx.message.reply_to_message) {
        const originalMsg = ctx.message.reply_to_message.text;
        const targetUserId = originalMsg.match(/User ID: (\d+)/)?.[1];
        
        if (targetUserId) {
            await bot.telegram.sendMessage(targetUserId, `💬 *Balasan dari Owner:*\n\n${ctx.message.text}`, { parse_mode: 'Markdown' });
            return ctx.reply('✅ Balasan terkirim ke user.');
        }
    }

    // Jika User mengirim pesan ke Bot (Support)
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('🚀 Pesan Anda telah terkirim ke Owner. Tunggu balasan ya!');
        await bot.telegram.sendMessage(OWNER_ID, `📩 *PESAN BANTUAN BARU*\n\nDari: ${ctx.from.first_name} (@${ctx.from.username})\nUser ID: ${ctx.from.id}\n\nPesan:\n${ctx.message.text}`, { parse_mode: 'Markdown' });
    }
});

// Menu Kembali
bot.action('start_menu', async (ctx) => {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { statusTopup: false }); 
    const isOwner = ctx.from.id === OWNER_ID;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await ctx.editMessageCaption(`👋 *Main Menu Manzzy ID*\n\n💰 Saldo: *${formatIDR(user.saldo)}*`, {
        parse_mode: 'Markdown',
        ...mainKeyboard(isOwner)
    });
});


// --- HELPER PAGINATION ---
const createPagination = (data, prefix, currentPage = 0, itemsPerPage = 8) => {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const items = data.slice(start, end);

    const buttons = items.map(item => [
        Markup.button.callback(item.text, `${prefix}_${item.id}`)
    ]);

    const navRow = [];
    if (currentPage > 0) navRow.push(Markup.button.callback('⬅️ Prev', `${prefix}page_${currentPage - 1}`));
    if (currentPage < totalPages - 1) navRow.push(Markup.button.callback('Next ➡️', `${prefix}page_${currentPage + 1}`));
    
    if (navRow.length > 0) buttons.push(navRow);
    buttons.push([Markup.button.callback('🏠 Menu Utama', 'start_menu')]);
    
    return Markup.inlineKeyboard(buttons);
};

// --- 1. LIST SERVICES DENGAN HALAMAN ---
bot.action(/^(list_services|svcpage_(.+))$/, async (ctx) => {
    try {
        const page = ctx.match[2] ? parseInt(ctx.match[2]) : 0;
        await ctx.answerCbQuery();
        
        const res = await roApi.get('/v2/services');
        const services = res.data.data.map(s => ({ text: s.service_name, id: s.service_code }));

        await ctx.editMessageCaption('📱 *Pilih Layanan (Hal ' + (page + 1) + '):*', {
            parse_mode: 'Markdown',
            ...createPagination(services, 'svc', page)
        });
    } catch (e) { ctx.reply('❌ Gagal ambil layanan.'); }
});

// --- HELPER UNTUK MEMBUAT TOMBOL GRID ---
const createGrid = (data, prefix, page = 0, columns = 2, rows = 8) => {
    const itemsPerPage = columns * rows;
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const start = page * itemsPerPage;
    const items = data.slice(start, start + itemsPerPage);

    const keyboard = [];
    for (let i = 0; i < items.length; i += columns) {
        keyboard.push(items.slice(i, i + columns).map(item => 
            Markup.button.callback(item.text, `${prefix}_${item.id}`)
        ));
    }

    // Navigasi
    const navRow = [];
    if (page > 0) navRow.push(Markup.button.callback('⬅️ Sebelumnya', `${prefix}pg_${page - 1}`));
    if (page < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya ➡️', `${prefix}pg_${page + 1}`));
    if (navRow.length > 0) keyboard.push(navRow);

    keyboard.push([Markup.button.callback('🔙 Kembali', 'list_services'), Markup.button.callback('🏠 Menu', 'start_menu')]);
    
    return { keyboard, totalPages, totalItems: data.length };
};

// --- STEP 2: PILIH NEGARA (PASTIKAN SERVICE ID TERIKUT) ---
bot.action(/^(svc_(.+)|svcpg_(.+)_(.+))$/, async (ctx) => {
    const serviceId = ctx.match[2] || ctx.match[3];
    const page = ctx.match[4] ? parseInt(ctx.match[4]) : 0;

    try {
        await ctx.answerCbQuery('Memuat Negara...');
        const res = await roApi.get(`/v2/countries?service_id=${serviceId}`);
        
        // Cek apakah data ada
        if (!res.data || !res.data.data) return ctx.reply('❌ Gagal mengambil data dari pusat.');

        const countries = res.data.data.map(c => ({
            text: `🌍 ${c.name}`,
            // Kirim: spg_[serviceId]_[numberId]
            id: `${serviceId}_${c.number_id}`
        }));

        // Buat Grid 2 Kolom
        const grid = [];
        const start = page * 16; // 8 baris x 2 kolom
        const pagedData = countries.slice(start, start + 16);

        for (let i = 0; i < pagedData.length; i += 2) {
            grid.push(pagedData.slice(i, i + 2).map(c => 
                Markup.button.callback(c.text, `spg_${c.id}`)
            ));
        }

        // Navigasi
        const nav = [];
        if (page > 0) nav.push(Markup.button.callback('⬅️ Prev', `svcpg_${serviceId}_${page - 1}`));
        if (start + 16 < countries.length) nav.push(Markup.button.callback('Next ➡️', `svcpg_${serviceId}_${page + 1}`));
        if (nav.length > 0) grid.push(nav);
        grid.push([Markup.button.callback('🏠 Menu', 'start_menu')]);

        await ctx.editMessageCaption(`🌍 *PILIH NEGARA*\nLayanan ID: ${serviceId}\nHalaman: ${page + 1}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(grid)
        });
    } catch (e) { ctx.reply('❌ Gagal memuat negara.'); }
});

// --- STEP 3: PILIH SERVER (FIXED FIND ERROR) ---
bot.action(/^spg_(.+)_(.+)$/, async (ctx) => {
    const svcId = ctx.match[1]; // ID Aplikasi
    const numId = ctx.match[2]; // ID Negara

    try {
        await ctx.answerCbQuery('Memuat Server...');

        const res = await roApi.get(`/v2/countries?service_id=${svcId}`);
        
        // Validasi data API sebelum .find()
        if (!res.data || !res.data.data) {
            throw new Error("Data API Kosong");
        }

        const country = res.data.data.find(c => String(c.number_id) === String(numId));
        
        if (!country || !country.pricelist) {
            return ctx.reply('❌ Server tidak tersedia untuk negara ini.');
        }

        // Buat Grid Server (S1, S2, dst) 3 Kolom
const serverButtons = [];
        const list = country.pricelist;
        const PROFIT_PERCENT = 15; // Keuntungan kamu

for (let i = 0; i < list.length; i += 3) {
            const row = list.slice(i, i + 3).map((p, idx) => {
                const price = Math.ceil((p.price + (p.price * PROFIT_PERCENT / 100)) / 100) * 100;
                
                // AMBIL ID NYA (ANGKA), BUKAN NAMANYA
                // Jika p.operator_id isinya teks, pastikan dari API dapet ID angkanya.
                // Kalau di pricelist ga ada ID angka, default ke 1 (any)
                const realOpId = p.operator_id_number || 1; 

                return Markup.button.callback(
                    `🖥️ S${i + idx + 1} - Rp${price.toLocaleString('id-ID')}`, 
                    `cf_${numId}_${p.provider_id}_${realOpId}_${price}`
                );
            });
            serverButtons.push(row);
        }
        
        serverButtons.push([Markup.button.callback('⬅️ Kembali', `svc_${svcId}`)]);

        const caption = `*${country.prefix} PILIH SERVER - ${country.name.toUpperCase()}*\n\n` +
                        `Layanan: WhatsApp\n` +
                        `Stok: ${country.stock_total} nomor\n` +
                        `Server: ${list.length} tersedia\n\n` +
                        `📋 *DAFTAR SERVER TERSEDIA*`;

        await ctx.editMessageCaption(caption, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(serverButtons)
        });

    } catch (e) {
        console.error("ERROR STEP 3:", e.message);
        ctx.reply('❌ Gagal memuat server. Coba klik ulang negara.');
    }
});
// --- 4. STEP: PILIH OPERATOR ---
bot.action(/^opr_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, price, iso] = ctx.match;
    
    try {
        await ctx.answerCbQuery('Memuat Operator...');
        const res = await roApi.get(`/v2/operators?country=${iso}&provider_id=${provId}`);
        
        let ops = res.data.data || [];
        if (ops.length === 0) ops = [{ id: 'any', name: 'Otomatis (Any)' }];

        const buttons = ops.map(op => [
            // SINKRON: Pakai 'cf_' agar cocok dengan Step 5
            Markup.button.callback(`📶 Op: ${op.name}`, `cf_${numId}_${provId}_${op.id}_${price}`)
        ]);

        buttons.push([Markup.button.callback('⬅️ Ganti Harga/Server', `srv_13_${numId}`)]);

        await ctx.editMessageCaption(`⚡ *Pilih Operator:*\nNegara: ${iso.toUpperCase()} | Harga: Rp ${parseInt(price).toLocaleString('id-ID')}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) { 
        ctx.reply('❌ Gagal memuat operator.'); 
    }
});

// --- 5. STEP: KONFIRMASI ---
bot.action(/^cf_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, opId, price] = ctx.match;

    const msg = `🛒 *KONFIRMASI PESANAN*\n━━━━━━━━━━━━━━━━━━\n` +
                `📶 Operator: *${opId.toUpperCase()}*\n` +
                `💰 Biaya: *Rp ${parseInt(price).toLocaleString('id-ID')}*\n━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ _Saldo Manzzy ID Anda akan langsung terpotong._`;

    await ctx.editMessageCaption(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            // KITA LEMPAR 4 DATA: numId, provId, opId, price
            [Markup.button.callback('✅ BELI SEKARANG', `buy_${numId}_${provId}_${opId}_${price}`)],
            [Markup.button.callback('❌ BATAL', 'start_menu')]
        ])
    });
});

// step 6
bot.action(/^buy_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    // [1]numId, [2]provId, [3]opId, [4]price
    const [_, numId, provId, opId, price] = ctx.match; 
    const userId = ctx.from.id;

    try {
        // 1. LANGSUNG MATIKAN LOADING TELEGRAM (Cukup begini, JANGAN tambahkan .hide())
        await ctx.answerCbQuery('🚀 Memproses Order...');

        const user = await User.findOne({ telegramId: userId });

        // 2. Cek Saldo
        if (!user || user.saldo < parseInt(price)) {
            // Gunakan reply agar pesan muncul di chat, bukan pop-up yang sering error 'hide'
            return ctx.reply(`❌ Saldo kurang! Butuh Rp ${parseInt(price).toLocaleString('id-ID')}`);
        }

        // 3. Panggil API V2
        const orderRes = await roApi.get('/v2/orders', {
            params: {
                number_id: numId,
                provider_id: provId,
                operator_id: opId
            }
        });

        if (orderRes.data && orderRes.data.success === true) {
            const order = orderRes.data.data;
            
            // 4. Potong Saldo
            user.saldo -= parseInt(price);
            await user.save();

            const successMsg = `✅ *NOMOR BERHASIL DIDAPATKAN*\n━━━━━━━━━━━━━━━━━━\n` +
                               `📱 Layanan: *${order.service}*\n` +
                               `📞 Nomor: \`${order.phone_number}\`\n` +
                               `🆔 Order ID: \`${order.order_id}\`\n` +
                               `💰 Harga: Rp ${parseInt(price).toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━━━━\n` +
                               `🕒 _Silakan gunakan nomornya dan tunggu OTP._`;

            await ctx.reply(successMsg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 CEK OTP', `status_${order.order_id}_${price}`)],
                    [Markup.button.callback('❌ BATALKAN & REFUND', `cncl_${order.order_id}_${price}`)]
                ])
            });
        } else {
            const errorMsg = orderRes.data?.message || "Stok habis atau server gangguan.";
            ctx.reply(`❌ Gagal Order: ${errorMsg}`);
        }
    } catch (e) {
        // LOG ERROR KE CONSOLE UNTUK DEBUG
        console.error("CRITICAL ERROR STEP 6:", e.message);
        
        // JANGAN panggil ctx.answerCbQuery().hide() di sini!
        // Cukup kirim pesan teks biasa agar bot tidak crash
        ctx.reply('❌ Terjadi kesalahan sistem. Silakan coba lagi nanti.');
    }
});

// --- 7. STEP: CEK STATUS OTP (FIXED V1 GET_STATUS) ---
bot.action(/^status_(.+)_(.+)$/, async (ctx) => {
    const [_, orderId, price] = ctx.match; 
    
    try {
        await ctx.answerCbQuery(); // Hilangkan loading biru

        // 1. Tembak API v1 sesuai dokumentasi terbaru lu

        const res = await roApi.get(`/v1/orders/get_status`, {
            params: { order_id: orderId.trim() }
        });


        const data = res.data?.data;

        // LOGIKA BARU: Cek apakah otp_code ada, bukan null, dan panjangnya lebih dari 0
        const isOtpValid = data && data.otp_code && String(data.otp_code).trim().length > 0;

        if (isOtpValid) {
            // --- 1. JIKA OTP BENAR-BENAR ADA (Angka/Kode Muncul) ---
            const msgSuccess = `📩 *OTP DITERIMA!*\n━━━━━━━━━━━━━━━━━━\n` +
                               `🔢 Kode: \`${data.otp_code}\`\n` +
                               `📝 Pesan: \`${data.otp_msg}\`\n━━━━━━━━━━━━━━━━━━\n` +
                               `✅ _Gunakan segera!_`;

            await ctx.editMessageText(msgSuccess, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('✅ SELESAIKAN ORDER', `done_${orderId}`)]])
            });

            // Kirim Testi
            await sendTesti({
                username: ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name,
                service: data.service, country: data.country, price: parseInt(price), orderId: orderId
            });

        } else {
            // --- 2. JIKA OTP BELUM ADA (Kosong, null, atau cuma spasi) ---
            const timeNow = new Date().toLocaleTimeString('id-ID');
            
            const msgWaiting = `⏳ *MENUNGGU OTP...*\n━━━━━━━━━━━━━━━━━━\n` +
                               `📞 Nomor: \`${data?.phone_number || 'Sedang diproses'}\`\n` +
                               `🆔 Order ID: \`${orderId}\`\n` +
                               `🕒 Terakhir Cek: *${timeNow}*\n━━━━━━━━━━━━━━━━━━\n` +
                               `ℹ️ _OTP belum masuk di server RumahOTP._\n` +
                               `⚠️ _Status: ${data?.status || 'Active'}_`;

            await ctx.editMessageText(msgWaiting, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 REFRESH / CEK OTP', `status_${orderId}_${price}`)],
                    [Markup.button.callback('❌ BATALKAN & REFUND', `cncl_${orderId}_${price}`)]
                ])
            });
        }
// ...
    } catch (e) { 
        console.error("ERROR GET_STATUS V1:", e.message);
        ctx.reply('❌ Terjadi kesalahan saat cek status ke API.'); 
    }
});
// --- 9. STEP: SELESAIKAN ORDER (STATUS COMPLETED) ---
bot.action(/^done_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    
    try {
        await ctx.answerCbQuery('✅ Menyelesaikan pesanan...');

        // Tembak API v1 set_status (Sama seperti cancel, tapi statusnya beda)
        // Gunakan status 'completed' sesuai standar API RumahOTP
        const res = await roApi.get(`/v1/orders/set_status`, {
            params: {
                order_id: orderId,
                status: 'completed' // Mengunci order agar permanen selesai
            }
        });

        if (res.data && res.data.success === true) {
            const finishMsg = `✅ *ORDER SELESAI SAKSES!*\n━━━━━━━━━━━━━━━━━━\n` +
                              `🆔 Order ID: \`${orderId}\`\n` +
                              `🙏 Terima kasih telah menggunakan layanan Manzzy ID.\n━━━━━━━━━━━━━━━━━━\n` +
                              `ℹ️ _Nomor ini sudah tidak bisa dibatalkan/refund._`;

            // Kirim pesan baru sebagai konfirmasi final
            await ctx.reply(finishMsg, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 MENU UTAMA', 'start_menu')]
                ])
            });

            // Hapus pesan lama yang ada tombol 'SELESAIKAN' agar tidak di-spam
            try { 
                await ctx.deleteMessage(); 
            } catch (err) {
                // Jika gagal hapus (misal pesan > 48 jam), edit saja pesannya
                await ctx.editMessageText(`✅ Order \`${orderId}\` Selesai.`);
            }
        } else {
            const errMsg = res.data?.message || "Gagal menyelesaikan di server.";
            ctx.reply(`❌ Gagal: ${errMsg}`);
        }
    } catch (e) {
        console.error("ERROR DONE ORDER:", e.message);
        ctx.reply('❌ Terjadi kesalahan saat menyelesaikan order.');
    }
});

// --- 8. STEP: CANCEL & REFUND (FIXED URL & STATUS) ---
bot.action(/^cncl_(.+)_(.+)$/, async (ctx) => {
    const [_, orderId, price] = ctx.match;
    const userId = ctx.from.id;

    try {
        await ctx.answerCbQuery('⏳ Sedang memproses refund...');

        // 1. Tembak API RumahOTP (v1 sesuai dokumentasi kamu)
        // Format: /v1/orders/set_status?order_id=ID&status=cancel
        const res = await roApi.get(`/v1/orders/set_status`, {
            params: {
                order_id: orderId,
                status: 'cancel' // Ini parameter wajibnya
            }
        });

        // 2. CEK RESPON API
        if (res.data && res.data.success === true) {
            const user = await User.findOne({ telegramId: userId });
            
            if (user) {
                // Tambahkan saldo sesuai harga beli (price dari callback)
                user.saldo += parseInt(price);
                await user.save();

                const refundMsg = `✅ *PESANAN DIBATALKAN & REFUND*\n━━━━━━━━━━━━━━━━━━\n` +
                                 `🆔 Order ID: \`${orderId}\`\n` +
                                 `💰 Refund: *Rp ${parseInt(price).toLocaleString('id-ID')}*\n` +
                                 `💳 Saldo Anda sekarang: *Rp ${user.saldo.toLocaleString('id-ID')}*\n━━━━━━━━━━━━━━━━━━\n` +
                                 `🏠 _Saldo telah otomatis dikembalikan._`;

                // Gunakan editMessageText (bukan Caption) karena Step 7 tadi pakai Text
                await ctx.editMessageText(refundMsg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🏠 MENU UTAMA', 'start_menu')]
                    ])
                });
            }
        } else {
            // Jika API menolak (misal: OTP sudah masuk duluan)
            const pesanGagal = res.data?.message || "Nomor sudah ditarik atau OTP sudah masuk.";
            ctx.reply(`❌ Gagal Batal: ${pesanGagal}`);
        }
    } catch (e) {
        console.error("ERROR REFUND:", e.message);
        ctx.reply('❌ Sistem error saat memproses refund. Hubungi Admin.');
    }
});
// NOTIF TESTI KE 

// --- FUNGSI KIRIM TESTIMONI OTOMATIS ---
const sendTesti = async (data) => {
    const text = `🛒 *TESTIMONI PEMBELIAN BERHASIL*\n` +
                 `━━━━━━━━━━━━━━━━━━\n` +
                 `👤 User: ${data.username || 'Hidden'}\n` +
                 `📱 Layanan: *${data.service}*\n` +
                 `🌍 Negara: *${data.country}*\n` +
                 `💰 Harga: *Rp ${parseInt(data.price).toLocaleString('id-ID')}*\n` +
                 `🆔 Order ID: \`${data.orderId}\`\n` +
                 `━━━━━━━━━━━━━━━━━━\n` +
                 `✅ *STATUS:* Nomor Aktif & OTP Berhasil!\n` +
                 `🤖 Beli di: @${process.env.BOT_USERNAME || 'ManzzyID_Bot'}`;

    try {
        await bot.telegram.sendMessage(CHANNEL_ID, text, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Gagal kirim testi ke channel:", e.message);
    }
};

// TOP UP SALDO
bot.action('topup_menu', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Aktifkan mode input teks di DB agar user bisa ketik nominal bebas
        await User.findOneAndUpdate({ telegramId: userId }, { statusTopup: true });

        const msg = `💳 *TOP UP SALDO - MANZZY ID*\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `Metode: *QRIS Otomatis*\n` +
                    `Minimal: *Rp 2.000*\n\n` +
                    `📝 *Cara Top Up:*\n` +
                    `• Pilih tombol nominal di bawah\n` +
                    `• Atau *Ketik Langsung* nominalnya\n` +
                    `  _(Contoh: ketik 2500)_`;
        
        await ctx.editMessageCaption(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('Rp 2.000', 'depo_2000'), 
                    Markup.button.callback('Rp 3.000', 'depo_3000'),
                    Markup.button.callback('Rp 5.000', 'depo_5000')
                ],
                [
                    Markup.button.callback('Rp 10.000', 'depo_10000'),
                    Markup.button.callback('Rp 15.000', 'depo_15000'),
                    Markup.button.callback('Rp 20.000', 'depo_20000')
                ],
                [
                    Markup.button.callback('Rp 30.000', 'depo_30000'),
                    Markup.button.callback('Rp 50.000', 'depo_50000'),
                    Markup.button.callback('Rp 100.000', 'depo_100000')
                ],
                [Markup.button.callback('🏠 Kembali ke Menu', 'start_menu')]
            ])
        });
    } catch (e) {
        console.error("ERROR TOPUP MENU:", e.message);
        ctx.answerCbQuery('❌ Gagal memuat menu top up.');
    }
});
// --- 2. GENERATE QRIS ---
bot.action(/^depo_(.+)$/, async (ctx) => {
    const nominal = ctx.match[1];
    try {
        await ctx.answerCbQuery('Generate QRIS...');
        
        // Panggil API Deposit RumahOTP
        const res = await roApi.get(`/v1/deposit/create?amount=${nominal}&payment_id=qris`);
        
        if (res.data.success) {
            const d = res.data.data;
            const depoMsg = `✅ *TAGIHAN PEMBAYARAN*\n━━━━━━━━━━━━━━━━━━\n` +
                            `🆔 ID: \`${d.id}\`\n` +
                            `💰 Total Bayar: *Rp ${d.amount.toLocaleString('id-ID')}*\n` +
                            `📥 Saldo Diterima: *Rp ${d.currency.diterima.toLocaleString('id-ID')}*\n` +
                            `🕒 Expired: 15 Menit\n━━━━━━━━━━━━━━━━━━\n` +
                            `📢 *CARA BAYAR:*\n` +
                            `1. Download/Screenshot QRIS di atas.\n` +
                            `2. Scan pakai Dana, OVO, GoPay, ShopeePay, atau M-Banking.\n` +
                            `3. Setelah bayar, klik tombol **CEK STATUS** di bawah.`;

            // Kirim QRIS sebagai foto
            await ctx.replyWithPhoto(d.qr_image, {
                caption: depoMsg,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 CEK STATUS', `checkdepo_${d.id}_${d.currency.diterima}`)],
                    [Markup.button.callback('❌ BATALKAN', `canceldepo_${d.id}`)]
                ])
            });
        } else {
            ctx.reply(`❌ Gagal generate QRIS: ${res.data.message}`);
        }
    } catch (e) {
        ctx.reply('❌ Terjadi kesalahan sistem deposit.');
    }
});

// --- 3. CEK STATUS DEPOSIT (PENENTU SALDO MASUK) ---
bot.action(/^checkdepo_(.+)_(.+)$/, async (ctx) => {
    const [_, depoId, saldoMasuk] = ctx.match;
    const userId = ctx.from.id;

    try {
        await ctx.answerCbQuery('Mengecek pembayaran...');
        const res = await roApi.get(`/v1/deposit/get_status?deposit_id=${depoId}`);
        
        if (res.data.success) {
            const status = res.data.data.status;

            if (status === 'success') {
                // UPDATE SALDO DI DATABASE MONGODB
                const user = await User.findOne({ telegramId: userId });
                user.saldo += parseInt(saldoMasuk);
                await user.save();

                await ctx.editMessageCaption(`✅ *PEMBAYARAN BERHASIL!*\n\nSaldo sebesar *Rp ${parseInt(saldoMasuk).toLocaleString('id-ID')}* telah ditambahkan ke akun Anda.\nTerima kasih telah top up!`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Utama', 'start_menu')]])
                });
                
                // Notif ke Owner (Kamu)
                bot.telegram.sendMessage(OWNER_ID, `💰 *NOTIF DEPOSIT MASUK*\nUser: ${ctx.from.first_name} (${userId})\nJumlah: Rp ${saldoMasuk}\nID: ${depoId}`);
                
            } else if (status === 'pending') {
                await ctx.answerCbQuery('⚠️ Pembayaran belum terdeteksi. Silakan bayar dulu!', { show_alert: true });
            } else {
                await ctx.editMessageCaption(`❌ *DEPOSIT GAGAL/EXPIRED*`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Utama', 'start_menu')]])
                });
            }
        }
    } catch (e) {
        ctx.answerCbQuery('Gagal cek status depo.');
    }
});

// --- 4. CANCEL DEPOSIT ---
bot.action(/^canceldepo_(.+)$/, async (ctx) => {
    const depoId = ctx.match[1];
    try {
        await roApi.get(`/v1/deposit/cancel?deposit_id=${depoId}`);
        await ctx.editMessageCaption('❌ Tagihan pembayaran telah dibatalkan.', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Utama', 'start_menu')]])
        });
    } catch (e) {
        ctx.answerCbQuery('Gagal batal depo.');
    }
});

bot.on('text', async (ctx) => {
    // 1. Abaikan kalau ini command /start, /menu, dll
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.from.id;
    
    try {
        // 2. Ambil data user dari DB
        const user = await User.findOne({ telegramId: userId });

        // 3. CEK: Apakah user memang sedang di mode Top Up?
        // Kalau statusTopup false, bot diem aja (nggak proses teks sebagai nominal)
        if (!user || !user.statusTopup) return;

        // 4. Ambil angka saja dari input
        const rawText = ctx.message.text.replace(/[^0-9]/g, '');
        const input = parseInt(rawText);

        if (!isNaN(input) && rawText !== "") {
            // Cek Minimum Rp 2.000
            if (input < 2000) {
                return ctx.reply('⚠️ *Minimal Top Up adalah Rp 2.000*, Bre!\nSilakan masukkan nominal yang lebih besar.', { parse_mode: 'Markdown' });
            }

            // SETELAH INPUT BENAR, MATIKAN STATUS TOPUP (Biar nggak looping)
            user.statusTopup = false;
            await user.save();

            // 5. Kirim Konfirmasi
            const msg = `💳 *KONFIRMASI TOP UP*\n━━━━━━━━━━━━━━━━━━\n` +
                        `💰 Nominal: *Rp ${input.toLocaleString('id-ID')}*\n` +
                        `📝 Metode: *QRIS (Otomatis)*\n━━━━━━━━━━━━━━━━━━\n` +
                        `Apakah data di atas sudah benar?`;

            return ctx.reply(msg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Lanjut Bayar', `depo_${input}`)],
                    [Markup.button.callback('❌ Batal', 'topup_menu')]
                ])
            });
        }
    } catch (e) {
        console.error("ERROR TEXT HANDLER:", e.message);
    }
});
// --- 4. RUN BOT ---
bot.launch().then(() => {
  console.log('🚀 Bot Manzzy ID sudah online!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));