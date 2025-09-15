const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background/background.js',
    popup: './src/popup/popup.js',
    content: './src/content/content.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json'
        },
        {
          from: 'src/popup/popup.html',
          to: 'popup.html'
        },
        {
          from: 'src/popup/popup.css',
          to: 'popup.css'
        },
        {
          from: 'src/icons',
          to: 'icons'
        },
        {
          from: 'src/content/iframe-recorder.js',
          to: 'iframe-recorder.js'
        },
        {
          from: 'src/extension/pages/help.html',
          to: 'help.html'
        },
        {
          from: 'src/extension/pages/privacy-policy.html',
          to: 'privacy.html'
        },
        {
          from: 'src/utils',
          to: '.'
        },
        {
          from: 'src/ai',
          to: '.'
        },
        {
          from: 'src/network',
          to: '.'
        },
        {
          from: 'src/integrations',
          to: '.'
        },
        {
          from: 'src/pom',
          to: '.'
        }
      ]
    })
  ],
  resolve: {
    extensions: ['.js', '.json']
  },
  devtool: 'source-map'
};