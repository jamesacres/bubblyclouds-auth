const nodeExternals = require('webpack-node-externals');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const NodemonPlugin = require('nodemon-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');

const outputPath = path.resolve(__dirname, 'dist');

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  entry: './src/index.ts',
  devtool: isProduction ? 'source-map' : 'inline-cheap-module-source-map',
  externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
  externals: [nodeExternals()], // in order to ignore all modules in node_modules folder
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
        parallel: true,
      }),
    ],
  },
  output: {
    path: outputPath,
    filename: 'index.js',
  },
  plugins: [
    // Add your plugins here
    // Learn more about plugins from https://webpack.js.org/configuration/plugins/
    new CleanWebpackPlugin({
      cleanStaleWebpackAssets: false, // Automatically remove all unused webpack assets on rebuild
    }),
    new Dotenv({
      systemvars: true, // load all the predefined 'process.env' variables which will trump anything local per dotenv specs.
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './package.json', to: './' },
        { from: './package-lock.json', to: './' },
      ],
    }),
    ...(isProduction
      ? []
      : [
          // Restart node server automatically
          new NodemonPlugin({
            ignore: ['*.js.map', '*.d.ts'],
            script: './dist/index.js',
            watch: outputPath,
          }),
        ]),
  ],
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: 'ts-loader',
        exclude: ['/node_modules/'],
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: 'asset',
      },

      // Add your rules for custom modules here
      // Learn more about loaders from https://webpack.js.org/loaders/
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    plugins: [
      // Using this plugin means that you should no longer need to add alias entries in your webpack.config.js which correspond to the paths entries in your tsconfig.json. This plugin creates those alias entries for you, so you don't have to!
      new TsconfigPathsPlugin(),
    ],
  },
};

module.exports = () => {
  if (isProduction) {
    config.mode = 'production';
  } else {
    config.mode = 'development';
  }
  return config;
};
