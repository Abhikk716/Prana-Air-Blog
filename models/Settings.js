import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  anthropicApiKey: {
    type: String,
    default: ''
  }
}, { timestamps: true });

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

export default Settings;
