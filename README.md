# Hotjar Clone - Session Recording and Analytics

A Next.js application for recording and analyzing user sessions on websites. This tool allows you to track user interactions, replay sessions, and analyze user behavior.

## Features

-   Real-time session recording
-   Session playback with controls
-   Mouse movement tracking
-   Click and scroll tracking
-   Input field tracking
-   Page visibility tracking
-   Analytics dashboard

## Getting Started

### Prerequisites

-   Node.js 18.x or later
-   npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/hotclone.git
cd hotclone
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Start the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Integration Guide

To integrate the session recording into your website, add the following script to your HTML:

```html
<script>
    // Initialize session recording
    window.initSessionRecording("YOUR_API_ENDPOINT");
</script>
```

Replace `YOUR_API_ENDPOINT` with the URL of your session recording API endpoint.

## API Endpoints

-   `POST /api/sessions` - Save a new session
-   `GET /api/sessions` - Retrieve all sessions
-   `DELETE /api/sessions?id={sessionId}` - Delete a specific session

## Development

### Project Structure

-   `src/app` - Next.js app router pages
-   `src/components` - React components
-   `src/utils` - Utility functions and scripts
-   `src/app/api` - API routes

### Building for Production

```bash
npm run build
# or
yarn build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

-   Inspired by Hotjar
-   Built with Next.js and TypeScript
